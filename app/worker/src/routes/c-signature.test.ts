import { createMiddleware } from 'hono/factory'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCaseAddress } from '../db/case-address'
import { hasConsent } from '../db/consents'
import { findSessionItem, type ItemRow } from '../db/documents'
import { getEsignMapping } from '../db/esign-settings'
import { getRequest, type RequestBundle } from '../db/requests'
import { app } from '../index'
import { startSignature, TemplateInvalidError } from '../integrations/esign/start'
import { ProviderError } from '../integrations/provider-error'
import { _resetRateLimitForTests } from '../middleware/link-rate-limit'

// Unit tests for the e-sign start route: no network; db modules and startSignature are mocked,
// requireClientHeader stays real, clientSession sets a fixed session.
vi.mock('../db/case-address')
vi.mock('../db/consents')
vi.mock('../db/documents')
vi.mock('../db/esign-settings')
vi.mock('../db/requests')
vi.mock('../integrations/esign/start', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../integrations/esign/start')>()),
  startSignature: vi.fn(),
}))
vi.mock('../middleware/client-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../middleware/client-session')>()),
  clientSession: createMiddleware(async (c, next) => {
    c.set('client', { linkId: 'L1', requestId: 'R1', firmId: 'F1', expiresAt: '2099-01-01T00:00:00Z', openedAt: null })
    await next()
  }),
}))

const BASE = { SUPABASE_URL: 'https://unit.supabase.test', SUPABASE_SECRET_KEY: 'unit' }
const ENV = { ...BASE, DOCUSEAL_API_KEY: 'k', DOCUSEAL_API_URL: 'https://api.docuseal.com' } as unknown as Env
const ITEM_ID = '11111111-1111-4111-8111-111111111111'

const item = (over: Partial<ItemRow> = {}): ItemRow => ({
  id: ITEM_ID,
  request_id: 'R1',
  position: 1,
  kind: 'signature',
  label: 'Sign your engagement letter',
  required: true,
  status: 'pending',
  rejection_note: null,
  config: { template: 'engagement_letter' },
  ...over,
})
const bundle = {
  request: { contact_email: 'c@example.com' },
  case: { id: 'C1', first_name: 'Morgan', last_name: 'Lee', email: 'm@example.com', logics_case_id: 900002 },
} as unknown as RequestBundle

const start = (env = ENV, header = true) =>
  app.request(`/api/c/items/${ITEM_ID}/signature/start`, { method: 'POST', headers: header ? { 'X-Requested-With': 'ResSpark' } : {} }, env)
const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code

beforeEach(() => {
  _resetRateLimitForTests()
  vi.mocked(findSessionItem).mockResolvedValue(item())
  vi.mocked(getEsignMapping).mockResolvedValue({ engagement_letter: 1001, form_2848: null, form_8821: null })
  vi.mocked(hasConsent).mockResolvedValue(true)
  vi.mocked(getRequest).mockResolvedValue(bundle)
  vi.mocked(getCaseAddress).mockResolvedValue(null)
  vi.mocked(startSignature).mockResolvedValue({ connection_id: 'CONN', embed_src: 'https://docuseal.com/s/x', reused: true })
})
afterEach(() => vi.clearAllMocks())

describe('POST /api/c/items/:itemId/signature/start', () => {
  it('without X-Requested-With is 403', async () => {
    expect((await start(ENV, false)).status).toBe(403)
  })
  it("another request's item is 404", async () => {
    vi.mocked(findSessionItem).mockResolvedValue(null)
    expect((await start()).status).toBe(404)
  })
  it('an upload item is 409 item_kind_mismatch', async () => {
    vi.mocked(findSessionItem).mockResolvedValue(item({ kind: 'upload' }))
    const res = await start()
    expect([res.status, await code(res)]).toEqual([409, 'item_kind_mismatch'])
  })
  it('a form_433a template is 409 bad_template', async () => {
    vi.mocked(findSessionItem).mockResolvedValue(item({ config: { template: 'form_433a' } }))
    const res = await start()
    expect([res.status, await code(res)]).toEqual([409, 'bad_template'])
  })
  it('no API key is 503 provider_not_configured before any consent check', async () => {
    const res = await start(BASE as unknown as Env)
    expect([res.status, await code(res)]).toEqual([503, 'provider_not_configured'])
    expect(hasConsent).not.toHaveBeenCalled()
  })
  it('an unmapped template is 503 template_not_mapped', async () => {
    vi.mocked(getEsignMapping).mockResolvedValue({ engagement_letter: null, form_2848: null, form_8821: null })
    const res = await start()
    expect([res.status, await code(res)]).toEqual([503, 'template_not_mapped'])
    expect(hasConsent).not.toHaveBeenCalled()
  })
  it('no esign consent is 409 consent_required and never starts', async () => {
    vi.mocked(hasConsent).mockResolvedValue(false)
    const res = await start()
    expect([res.status, await code(res)]).toEqual([409, 'consent_required'])
    expect(hasConsent).toHaveBeenCalledWith(ENV, 'L1', 'esign', 'esign-v1')
    expect(startSignature).not.toHaveBeenCalled()
  })
  it('the 11th start in a minute is 429 rate_limited', async () => {
    for (let i = 0; i < 10; i++) expect((await start()).status).toBe(200)
    const res = await start()
    expect([res.status, await code(res)]).toEqual([429, 'rate_limited'])
  })
  it('an approved item is 409 item_approved', async () => {
    vi.mocked(findSessionItem).mockResolvedValue(item({ status: 'approved' }))
    const res = await start()
    expect([res.status, await code(res)]).toEqual([409, 'item_approved'])
  })
  it('a vendor error is 502 provider_error', async () => {
    vi.mocked(startSignature).mockRejectedValue(new ProviderError('docuseal', 500, 'http_500', true))
    const res = await start()
    expect([res.status, await code(res)]).toEqual([502, 'provider_error'])
  })
  it('a template with two roles is 503 template_invalid', async () => {
    vi.mocked(startSignature).mockRejectedValue(new TemplateInvalidError())
    const res = await start()
    expect([res.status, await code(res)]).toEqual([503, 'template_invalid'])
  })
  it('success returns exactly { connection_id, embed_src } and passes the mapped id and contact email', async () => {
    const res = await start()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ connection_id: 'CONN', embed_src: 'https://docuseal.com/s/x' })
    expect(vi.mocked(startSignature).mock.calls[0][1]).toMatchObject({ templateId: 1001, templateKey: 'engagement_letter', contactEmail: 'c@example.com' })
  })
  it('a signed item returns { connection_id, signed: true }', async () => {
    vi.mocked(startSignature).mockResolvedValue({ connection_id: 'CONN', signed: true, reused: true })
    expect(await (await start()).json()).toEqual({ connection_id: 'CONN', signed: true })
  })
})
