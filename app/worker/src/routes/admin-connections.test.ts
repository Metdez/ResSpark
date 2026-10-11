import { createMiddleware } from 'hono/factory'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getConnection, recordConnectionEvent, type ConnectionRow } from '../db/connections'
import {
  firmOwnsRequest,
  getConnectionSummary,
  getFirmConnection,
  listConnectionTransactions,
  listRequestConnections,
  type ConnectionSummary,
} from '../db/connections-ops'
import { app } from '../index'
import { NonRetryableError, ProviderError } from '../integrations/provider-error'
import { reconcileConnection } from '../jobs/reconcile'

// Unit tests for the staff connection routes: no network. The db modules and reconcile are mocked;
// staffAuth sets a fixed staff user when the test sends `x-test-staff`, else the real one runs.
vi.mock('../db/connections-ops', async (orig) => ({
  ...(await orig<typeof import('../db/connections-ops')>()),
  firmOwnsRequest: vi.fn(),
  getConnectionSummary: vi.fn(),
  getFirmConnection: vi.fn(),
  listConnectionTransactions: vi.fn(),
  listRequestConnections: vi.fn(),
}))
vi.mock('../db/connections', async (orig) => ({
  ...(await orig<typeof import('../db/connections')>()),
  getConnection: vi.fn(),
  recordConnectionEvent: vi.fn(),
}))
vi.mock('../jobs/reconcile', () => ({ reconcileConnection: vi.fn() }))
vi.mock('../middleware/staff-auth', async (orig) => {
  const real = await orig<typeof import('../middleware/staff-auth')>()
  return {
    ...real,
    staffAuth: createMiddleware(async (c, next) => {
      if (!c.req.header('x-test-staff')) return real.staffAuth(c, next)
      c.set('staff', { userId: 'U1', firmId: 'F1', role: 'staff', displayName: 'Z' })
      await next()
    }),
  }
})

const ENV = { SUPABASE_URL: 'https://unit.supabase.test', SUPABASE_SECRET_KEY: 'unit' } as unknown as Env
const REQ = '11111111-1111-4111-8111-111111111111'
const CONN = '22222222-2222-4222-8222-222222222222'
const conn = { id: CONN, firm_id: 'F1', provider: 'plaid', kind: 'bank' } as ConnectionRow
const summary = (id = CONN) => ({ id, status: 'connected' }) as unknown as ConnectionSummary

const call = (method: string, path: string, staff = true) =>
  app.request(`/api/admin${path}`, { method, headers: staff ? { 'x-test-staff': '1' } : {} }, ENV)
const body = async (res: Response) =>
  (await res.json()) as Record<string, unknown> & { error?: { code: string; message: string } }

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.mocked(firmOwnsRequest).mockResolvedValue(true)
  vi.mocked(listRequestConnections).mockResolvedValue([summary('A'), summary('B')])
  vi.mocked(getFirmConnection).mockResolvedValue(conn)
  vi.mocked(getConnection).mockResolvedValue(conn)
  vi.mocked(getConnectionSummary).mockResolvedValue(summary())
  vi.mocked(recordConnectionEvent).mockResolvedValue()
  vi.mocked(reconcileConnection).mockResolvedValue({ status: 'connected', applied: false })
  vi.mocked(listConnectionTransactions).mockResolvedValue({ rows: [], total: 0 })
})

describe('GET /requests/:id/connections', () => {
  it('lists the request connections in the order the read model returns', async () => {
    const res = await call('GET', `/requests/${REQ}/connections`)
    expect(res.status).toBe(200)
    expect((await body(res)).connections).toEqual([summary('A'), summary('B')])
    expect(firmOwnsRequest).toHaveBeenCalledWith(ENV, 'F1', REQ)
    expect(listRequestConnections).toHaveBeenCalledWith(ENV, 'F1', REQ)
  })

  it('is a uniform 404 for a request outside the firm', async () => {
    vi.mocked(firmOwnsRequest).mockResolvedValue(false)
    const res = await call('GET', `/requests/${REQ}/connections`)
    expect(res.status).toBe(404)
    expect((await body(res)).error?.code).toBe('not_found')
    expect(listRequestConnections).not.toHaveBeenCalled()
  })

  it('rejects a malformed id with 400', async () => {
    expect((await call('GET', '/requests/nope/connections')).status).toBe(400)
  })

  it('needs a bearer token', async () => {
    const res = await call('GET', `/requests/${REQ}/connections`, false)
    expect(res.status).toBe(401)
    expect(firmOwnsRequest).not.toHaveBeenCalled()
  })
})

describe('POST /connections/:id/refresh', () => {
  it('records the click, reconciles inline as staff and returns the refreshed summary', async () => {
    const res = await call('POST', `/connections/${CONN}/refresh`)
    expect(res.status).toBe(200)
    expect((await body(res)).connection).toEqual(summary())
    expect(getFirmConnection).toHaveBeenCalledWith(ENV, 'F1', CONN)
    expect(recordConnectionEvent).toHaveBeenCalledTimes(1)
    expect(recordConnectionEvent).toHaveBeenCalledWith(
      ENV,
      CONN,
      'connection.refresh_requested',
      { by: 'U1' },
      { type: 'staff', id: 'U1' }
    )
    expect(reconcileConnection).toHaveBeenCalledWith(ENV, CONN, { source: 'staff', actorId: 'U1' })
    expect(vi.mocked(recordConnectionEvent).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(reconcileConnection).mock.invocationCallOrder[0]
    )
    expect(getConnectionSummary).toHaveBeenCalledWith(ENV, conn)
  })

  it('is a uniform 404 for a connection outside the firm and never reconciles', async () => {
    vi.mocked(getFirmConnection).mockResolvedValue(null)
    const res = await call('POST', `/connections/${CONN}/refresh`)
    expect(res.status).toBe(404)
    expect(reconcileConnection).not.toHaveBeenCalled()
    expect(recordConnectionEvent).not.toHaveBeenCalled()
  })

  it('maps a transient provider failure to 502 provider_unavailable', async () => {
    vi.mocked(reconcileConnection).mockRejectedValue(new ProviderError('plaid', 503, 'http_503', true))
    const res = await call('POST', `/connections/${CONN}/refresh`)
    expect(res.status).toBe(502)
    expect((await body(res)).error?.code).toBe('provider_unavailable')
  })

  it('maps bank_not_available to 503 provider_not_available', async () => {
    vi.mocked(reconcileConnection).mockRejectedValue(new NonRetryableError('bank_not_available'))
    const res = await call('POST', `/connections/${CONN}/refresh`)
    expect(res.status).toBe(503)
    expect((await body(res)).error?.code).toBe('provider_not_available')
  })

  it('maps a permanent provider error to 409 provider_error carrying the vendor code only', async () => {
    vi.mocked(reconcileConnection).mockRejectedValue(
      new ProviderError('truv', 400, 'bad_response', false, 'vendor body text')
    )
    const res = await call('POST', `/connections/${CONN}/refresh`)
    expect(res.status).toBe(409)
    expect((await body(res)).error).toEqual({ code: 'provider_error', message: 'bad_response' })
  })
})

describe('GET /connections/:id/transactions', () => {
  it('reads 3 months when asked', async () => {
    vi.mocked(listConnectionTransactions).mockResolvedValue({ rows: [], total: 7 })
    const res = await call('GET', `/connections/${CONN}/transactions?months=3`)
    expect(res.status).toBe(200)
    expect(await body(res)).toEqual({ months: 3, total: 7, transactions: [] })
    expect(listConnectionTransactions).toHaveBeenCalledWith(ENV, 'F1', CONN, 3, 1000)
  })

  it('defaults to 6 months', async () => {
    await call('GET', `/connections/${CONN}/transactions`)
    expect(listConnectionTransactions).toHaveBeenCalledWith(ENV, 'F1', CONN, 6, 1000)
  })

  it('rejects any other window with 400', async () => {
    const res = await call('GET', `/connections/${CONN}/transactions?months=12`)
    expect(res.status).toBe(400)
    expect((await body(res)).error?.code).toBe('bad_request')
    expect(listConnectionTransactions).not.toHaveBeenCalled()
  })

  it('is a uniform 404 for a connection outside the firm', async () => {
    vi.mocked(listConnectionTransactions).mockResolvedValue(null)
    expect((await call('GET', `/connections/${CONN}/transactions`)).status).toBe(404)
  })
})
