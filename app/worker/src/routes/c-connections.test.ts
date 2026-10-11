import { createMiddleware } from 'hono/factory'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCase } from '../db/cases'
import { getConnection, type ConnectionRow } from '../db/connections'
import { latestItemSummary } from '../db/connections-ops'
import { hasConsent, recordConsent } from '../db/consents'
import { findSessionItem, sessionRequest, type ItemRow } from '../db/documents'
import { app } from '../index'
import { ProviderError } from '../integrations/provider-error'
import { startPayroll } from '../integrations/truv/start'
import { _resetRateLimitForTests } from '../middleware/link-rate-limit'

// Unit tests for the client connection routes: no network. Every db module and startPayroll are
// mocked; requireClientHeader stays real; clientSession sets a fixed session (request R1).
vi.mock('../db/cases')
vi.mock('../db/connections')
vi.mock('../db/connections-ops')
vi.mock('../db/consents')
vi.mock('../db/documents')
vi.mock('../db/events')
vi.mock('../integrations/truv/start')
vi.mock('../middleware/client-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../middleware/client-session')>()),
  clientSession: createMiddleware(async (c, next) => {
    c.set('client', { linkId: 'L1', requestId: 'R1', firmId: 'F1', expiresAt: '2099-01-01T00:00:00Z', openedAt: null })
    await next()
  }),
}))

const ITEM = '11111111-1111-4111-8111-111111111111'
const CONN = '33333333-3333-4333-8333-333333333333'
const send = vi.fn()
const env = (over: Record<string, unknown> = {}) =>
  ({ SUPABASE_URL: 'https://unit.supabase.test', TRUV_CLIENT_ID: 'c', TRUV_SECRET: 's', BANK_PROVIDER: 'plaid', JOBS: { send }, ...over }) as unknown as Env
const item = (over: Partial<ItemRow> = {}): ItemRow => ({
  id: ITEM,
  request_id: 'R1',
  position: 1,
  kind: 'payroll_connect',
  label: 'Connect your payroll',
  required: true,
  status: 'pending',
  rejection_note: null,
  config: null,
  ...over,
})
const call = (method: string, path: string, body?: unknown, opts: { header?: boolean; env?: Env } = {}) =>
  app.request(
    path,
    {
      method,
      headers: { 'content-type': 'application/json', ...(opts.header === false ? {} : { 'X-Requested-With': 'ResSpark' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    opts.env ?? env()
  )
const code = async (res: Response) => ((await res.json()) as { error: { code: string; message: string } }).error

beforeEach(() => {
  vi.resetAllMocks()
  _resetRateLimitForTests()
  vi.mocked(findSessionItem).mockResolvedValue(item())
  vi.mocked(hasConsent).mockResolvedValue(true)
  vi.mocked(recordConsent).mockResolvedValue({ created: true })
  vi.mocked(sessionRequest).mockResolvedValue({ case_id: 'C1', status: 'opened' })
  vi.mocked(getCase).mockResolvedValue({ id: 'C1', first_name: 'A', last_name: 'B', email: null, phone_e164: null } as never)
  vi.mocked(latestItemSummary).mockResolvedValue(null)
})

describe('GET /api/c/items/:itemId/connection', () => {
  it('an upload item is 409 item_not_connect', async () => {
    vi.mocked(findSessionItem).mockResolvedValue(item({ kind: 'upload' }))
    const res = await call('GET', `/api/c/items/${ITEM}/connection`)
    expect(res.status).toBe(409)
    expect((await code(res)).code).toBe('item_not_connect')
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
  it('a bank item with no Plaid secrets reports configured: false and Plaid capabilities', async () => {
    vi.mocked(findSessionItem).mockResolvedValue(item({ kind: 'bank_connect' }))
    const res = await call('GET', `/api/c/items/${ITEM}/connection`)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      provider: { id: 'plaid', configured: false, capabilities: { transactions: true, statementPdfs: true, hostedLink: true } },
      connection: null,
    })
  })
  it("another request's item is 404", async () => {
    vi.mocked(findSessionItem).mockResolvedValue(null)
    expect((await call('GET', `/api/c/items/${ITEM}/connection`)).status).toBe(404)
  })
})

describe('POST /api/c/consents', () => {
  it('without X-Requested-With is 403 bad_origin', async () => {
    const res = await call('POST', '/api/c/consents', { kind: 'payroll_data', text_version: 'x' }, { header: false })
    expect(res.status).toBe(403)
    expect((await code(res)).code).toBe('bad_origin')
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
  it('an unknown kind is 400', async () => {
    const res = await call('POST', '/api/c/consents', { kind: 'nope', text_version: '2026-10-10.1' })
    expect(res.status).toBe(400)
    expect(recordConsent).not.toHaveBeenCalled()
  })
})

describe('POST /api/c/connections/:kind/start', () => {
  it('bank with consent and Plaid configured is 503 provider_not_available (until Plan 04)', async () => {
    vi.mocked(findSessionItem).mockResolvedValue(item({ kind: 'bank_connect' }))
    const res = await call('POST', '/api/c/connections/bank/start', { item_id: ITEM }, { env: env({ PLAID_CLIENT_ID: 'p', PLAID_SECRET: 'q' }) })
    expect(res.status).toBe(503)
    expect((await code(res)).code).toBe('provider_not_available')
  })
  it('payroll start on a bank item is 409 item_kind_mismatch', async () => {
    vi.mocked(findSessionItem).mockResolvedValue(item({ kind: 'bank_connect' }))
    const res = await call('POST', '/api/c/connections/payroll/start', { item_id: ITEM })
    expect(res.status).toBe(409)
    expect((await code(res)).code).toBe('item_kind_mismatch')
  })
  it('an approved item is 409 item_approved', async () => {
    vi.mocked(findSessionItem).mockResolvedValue(item({ status: 'approved' }))
    const res = await call('POST', '/api/c/connections/payroll/start', { item_id: ITEM })
    expect(res.status).toBe(409)
    expect((await code(res)).code).toBe('item_approved')
    expect(startPayroll).not.toHaveBeenCalled()
  })
  it('a vendor error is 502 provider_error with the vendor code as message', async () => {
    vi.mocked(startPayroll).mockRejectedValue(new ProviderError('truv', 400, 'invalid_phone', false))
    const res = await call('POST', '/api/c/connections/payroll/start', { item_id: ITEM })
    expect(res.status).toBe(502)
    expect(await code(res)).toEqual({ code: 'provider_error', message: 'invalid_phone' })
  })
  it('a reused order answers 200 with the same body shape', async () => {
    vi.mocked(startPayroll).mockResolvedValue({ connection_id: CONN, bridge_token: 'bt', reused: true })
    const res = await call('POST', '/api/c/connections/payroll/start', { item_id: ITEM })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ connection_id: CONN, kind: 'payroll', provider: 'truv', capabilities: null, bridge_token: 'bt' })
  })
  it('a missing item_id is 400 and an unknown kind is 404', async () => {
    expect((await call('POST', '/api/c/connections/payroll/start', {})).status).toBe(400)
    expect((await call('POST', '/api/c/connections/teller/start', { item_id: ITEM })).status).toBe(404)
  })
})

describe('POST /api/c/connections/:id/reconcile', () => {
  it('enqueues up to 10 per minute per link; the 11th is 429 rate_limited', async () => {
    vi.mocked(getConnection).mockResolvedValue({ id: CONN, request_id: 'R1' } as ConnectionRow)
    const statuses: number[] = []
    for (let i = 0; i < 11; i++) statuses.push((await call('POST', `/api/c/connections/${CONN}/reconcile`)).status)
    expect(statuses.slice(0, 10).every((s) => s === 202)).toBe(true)
    expect(statuses[10]).toBe(429)
    expect(send).toHaveBeenCalledTimes(10)
    expect(send).toHaveBeenCalledWith({ type: 'reconcile', ref: CONN })
    const last = await call('POST', `/api/c/connections/${CONN}/reconcile`)
    expect((await code(last)).code).toBe('rate_limited')
  })
  it("another request's connection is 404 and nothing is sent", async () => {
    vi.mocked(getConnection).mockResolvedValue({ id: CONN, request_id: 'R2' } as ConnectionRow)
    const res = await call('POST', `/api/c/connections/${CONN}/reconcile`)
    expect(res.status).toBe(404)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(send).not.toHaveBeenCalled()
  })
})
