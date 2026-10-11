import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyLinkToken } from '../src/auth/client-link'
import { logEvent } from '../src/db/events'
import { getIntegration } from '../src/db/integrations'
import { listDashboardRequests } from '../src/db/dashboard'
import { createRequest, getRequest, getTemplates, sendRequest } from '../src/db/requests'
import { getStaffProfile } from '../src/db/staff'
import {
  bundle,
  call,
  CASE,
  caseRow,
  clientLinkRow,
  env,
  errorCode,
  FIRM,
  initKeys,
  LINK,
  linkRow,
  ORIGIN,
  REQ,
  sentBundle,
  stubFetch,
  SUB,
} from './requests-fixtures'

vi.mock('../src/db/staff', () => ({ getStaffProfile: vi.fn() }))
vi.mock('../src/db/events', () => ({ logEvent: vi.fn() }))
vi.mock('../src/db/integrations', () => ({ getIntegration: vi.fn() }))
vi.mock('../src/db/cases', () => ({ confirmLogicsCase: vi.fn(), getCase: vi.fn() }))
vi.mock('../src/db/dashboard', async (orig) => ({
  ...(await orig<typeof import('../src/db/dashboard')>()),
  listDashboardRequests: vi.fn(),
}))
vi.mock('../src/db/requests', () => ({
  getTemplates: vi.fn(),
  createRequest: vi.fn(),
  getRequest: vi.fn(),
  sendRequest: vi.fn(),
  regenerateLink: vi.fn(),
  revokeRequest: vi.fn(),
}))

const T1 = '00000000-0000-0000-0000-00000000a001'
const T2 = '00000000-0000-0000-0000-00000000a002'
const ITEMS = [
  { kind: 'bank_connect', label: 'Connect your bank', required: true, config: {} },
  { kind: 'payroll_connect', label: 'Connect your payroll', required: true, config: {} },
  { kind: 'address', label: 'Confirm your address', required: true, config: {} },
  { kind: 'upload', label: 'Government ID', required: true, config: { doc_code: 'government_id' } },
  { kind: 'signature', label: 'Engagement letter', required: false, config: { template: 'engagement_letter' } },
]
const TEMPLATES = [
  { id: T1, name: 'Standard resolution packet', items: ITEMS },
  { id: T2, name: 'Documents only', items: [ITEMS[3]] },
]
const draft = (items: unknown[] = ITEMS) => ({ case_id: CASE, template_id: T1, items })
const tokenOf = (url: string) => url.slice(ORIGIN.length)

beforeAll(initKeys)

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  stubFetch()
  vi.mocked(getStaffProfile).mockResolvedValue({ user_id: SUB, firm_id: FIRM, role: 'staff', display_name: 'Zack' })
  vi.mocked(getIntegration).mockResolvedValue(null)
  vi.mocked(getTemplates).mockResolvedValue(TEMPLATES as never)
  vi.mocked(createRequest).mockResolvedValue(REQ)
  vi.mocked(getRequest).mockResolvedValue(bundle())
  vi.mocked(sendRequest).mockResolvedValue({ link_id: LINK, version: 1, expires_at: '2026-10-25T00:00:00Z' })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  for (const f of [getTemplates, createRequest, listDashboardRequests, getRequest, sendRequest]) vi.mocked(f).mockReset()
})

describe('templates and drafts', () => {
  it('is 401 without a token', async () => {
    const res = await call('GET', '/api/admin/requests/templates', undefined, { auth: false })
    expect(res.status).toBe(401)
  })

  it('lists the global and firm templates with their items', async () => {
    const res = await call('GET', '/api/admin/requests/templates')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { templates: { id: string; items: unknown[] }[] }
    expect(body.templates.map((t) => t.id)).toEqual([T1, T2])
    expect(body.templates[0].items).toHaveLength(5)
    expect(getTemplates).toHaveBeenCalledWith(expect.anything(), FIRM)
  })

  it('creates a draft with the staff identity, the template name, and items in posted order', async () => {
    const reversed = [...ITEMS].reverse()
    const res = await call('POST', '/api/admin/requests', draft(reversed))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ request_id: REQ })
    expect(createRequest).toHaveBeenCalledWith(expect.anything(), {
      firm_id: FIRM,
      case_id: CASE,
      template_name: 'Standard resolution packet',
      items: reversed,
      created_by: SUB,
      agent_display_name: 'Zack',
    })
  })

  it('refuses zero items with no_items', async () => {
    const res = await call('POST', '/api/admin/requests', draft([]))
    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('no_items')
    expect(createRequest).not.toHaveBeenCalled()
  })

  it('refuses an unknown item kind', async () => {
    const res = await call('POST', '/api/admin/requests', draft([{ ...ITEMS[0], kind: 'crypto' }]))
    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('bad_request')
    expect(createRequest).not.toHaveBeenCalled()
  })

  it('refuses a blank label, a non-boolean required, and a non-object config', async () => {
    for (const bad of [{ label: '  ' }, { required: 'yes' }, { config: [] }, { label: 'x'.repeat(121) }]) {
      const res = await call('POST', '/api/admin/requests', draft([{ ...ITEMS[0], ...bad }]))
      expect(res.status).toBe(400)
    }
    expect(createRequest).not.toHaveBeenCalled()
  })

  it('refuses a signature item without an allowed template with bad_template', async () => {
    for (const config of [{ template: 'form_433a' }, {}]) {
      const res = await call('POST', '/api/admin/requests', draft([{ ...ITEMS[4], config }]))
      expect(res.status).toBe(400)
      expect(await errorCode(res)).toBe('bad_template')
    }
    expect(createRequest).not.toHaveBeenCalled()
  })

  it('accepts an allowed signature template and leaves other kinds unchecked', async () => {
    const items = [{ ...ITEMS[4], config: { template: 'form_2848' } }, { ...ITEMS[0], config: { template: 'form_433a' } }]
    const res = await call('POST', '/api/admin/requests', draft(items))
    expect(res.status).toBe(201)
  })

  it('refuses a case id that is not a uuid', async () => {
    const res = await call('POST', '/api/admin/requests', { ...draft(), case_id: '900001' })
    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('bad_request')
  })

  it('is 404 for a template the firm cannot see', async () => {
    const res = await call('POST', '/api/admin/requests', { ...draft(), template_id: REQ })
    expect(res.status).toBe(404)
    expect(createRequest).not.toHaveBeenCalled()
  })

  it('maps case_not_found from the RPC to 404', async () => {
    vi.mocked(createRequest).mockRejectedValue(new Error('case_not_found'))
    const res = await call('POST', '/api/admin/requests', draft())
    expect(res.status).toBe(404)
    expect(await errorCode(res)).toBe('case_not_found')
  })

  it('creates a second draft for the same body (no dedupe)', async () => {
    await call('POST', '/api/admin/requests', draft())
    await call('POST', '/api/admin/requests', draft())
    expect(createRequest).toHaveBeenCalledTimes(2)
  })
})

describe('GET /api/admin/requests (dashboard list)', () => {
  const ROW = {
    id: REQ,
    case_id: CASE,
    status: 'sent',
    template_name: 'Documents only',
    agent_display_name: 'Zack',
    client_name: 'Jordan Rivera',
    first_name: 'Jordan',
    last_name: 'Rivera',
    email: 'j@x.com',
    created_at: '2026-10-01T00:00:00Z',
    sent_at: null,
    opened_at: null,
    completed_at: null,
    expires_at: null,
    last_activity_at: null,
    overdue: false,
  }
  const list = async (query = '') => {
    vi.mocked(listDashboardRequests).mockResolvedValue([ROW])
    return call('GET', `/api/admin/requests${query}`)
  }

  it('lists every non-draft firm request with the Phase 2 keys when no filter is given', async () => {
    const res = await list()
    expect(res.status).toBe(200)
    const body = (await res.json()) as { requests: Record<string, unknown>[] }
    for (const key of ['id', 'status', 'client_name', 'sent_at', 'expires_at', 'created_at'])
      expect(body.requests[0]).toHaveProperty(key)
    expect(listDashboardRequests).toHaveBeenCalledWith(expect.anything(), FIRM, { status: undefined, q: undefined })
  })

  it('passes a known status through', async () => {
    await list('?status=complete')
    expect(listDashboardRequests).toHaveBeenCalledWith(expect.anything(), FIRM, { status: 'complete', q: undefined })
  })

  it('refuses an unknown status with bad_request', async () => {
    const res = await list('?status=bogus')
    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('bad_request')
    expect(listDashboardRequests).not.toHaveBeenCalled()
  })

  it('refuses draft, which the dashboard never lists', async () => {
    const res = await list('?status=draft')
    expect(res.status).toBe(400)
  })

  it('sanitizes q before it reaches the filter', async () => {
    await list('?q=%20%20Ann%20(Smith),%20ann@x.com%20')
    expect(listDashboardRequests).toHaveBeenCalledWith(expect.anything(), FIRM, {
      status: undefined,
      q: 'Ann Smith ann@x.com',
    })
  })

  it('treats an empty q as no search', async () => {
    await list('?q=')
    expect(listDashboardRequests).toHaveBeenCalledWith(expect.anything(), FIRM, { status: undefined, q: undefined })
  })
})

describe('GET /api/admin/requests/:id', () => {
  it('re-derives a link URL whose token verifies against the link row', async () => {
    vi.mocked(getRequest).mockResolvedValue(sentBundle())
    const res = await call('GET', `/api/admin/requests/${REQ}`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { link: { url: string; version: number }; case: { logics_case_id: number } }
    expect(body.link.url.startsWith(ORIGIN)).toBe(true)
    expect(body.link.version).toBe(1)
    expect(body.case.logics_case_id).toBe(900001)
    const row = clientLinkRow(1)
    expect(await verifyLinkToken(env(), tokenOf(body.link.url), async () => row)).toEqual(row)
    expect(getRequest).toHaveBeenCalledWith(expect.anything(), FIRM, REQ)
  })

  it('returns url null for a revoked link', async () => {
    vi.mocked(getRequest).mockResolvedValue(sentBundle(linkRow({ revoked_at: '2026-10-11T01:00:00Z' })))
    const body = (await (await call('GET', `/api/admin/requests/${REQ}`)).json()) as { link: { url: null } }
    expect(body.link.url).toBeNull()
  })

  it('returns url null for an expired link', async () => {
    vi.mocked(getRequest).mockResolvedValue(sentBundle(linkRow({ expires_at: '2020-01-01T00:00:00Z' })))
    const body = (await (await call('GET', `/api/admin/requests/${REQ}`)).json()) as { link: { url: null } }
    expect(body.link.url).toBeNull()
  })

  it('is 404 for a request outside the firm', async () => {
    vi.mocked(getRequest).mockResolvedValue(null)
    const res = await call('GET', `/api/admin/requests/${REQ}`)
    expect(res.status).toBe(404)
    expect(await errorCode(res)).toBe('not_found')
  })

  it('is 400 for an id that is not a uuid', async () => {
    const res = await call('GET', '/api/admin/requests/abc')
    expect(res.status).toBe(400)
    expect(getRequest).not.toHaveBeenCalled()
  })
})

const send = (body: unknown, opts?: { env?: Record<string, unknown> }) =>
  call('POST', `/api/admin/requests/${REQ}/send`, body, opts)
const jordan = { email: 'jordan.rivera@example.com', phone: '(555) 010-0001' }

describe('POST /api/admin/requests/:id/send', () => {
  it('validates, re-reads Logics, sends, and returns a copyable URL that verifies', async () => {
    const res = await send(jordan)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { url: string; expires_at: string; version: number }
    expect(body.version).toBe(1)
    expect(body.expires_at).toBe('2026-10-25T00:00:00Z')
    expect(tokenOf(body.url)).toMatch(/^[A-Za-z0-9_-]{64}$/)
    const row = clientLinkRow(1)
    expect(await verifyLinkToken(env(), tokenOf(body.url), async () => row)).toEqual(row)
    const input = vi.mocked(sendRequest).mock.calls[0][1]
    expect(input).toMatchObject({
      request_id: REQ,
      firm_id: FIRM,
      actor_id: SUB,
      contact_email: 'jordan.rivera@example.com',
      contact_phone_e164: '+15550100001',
    })
    expect(input.payload).toMatchObject({
      to_email: 'jordan.rivera@example.com',
      to_phone_e164: '+15550100001',
      contact_overridden: false,
      logics_case_id: 900001,
    })
  })

  it('emails the link to the stored contact on Send and logs request.email_sent', async () => {
    const email = { send: vi.fn(async (_m: { to: string; text: string }) => ({ messageId: 'msg_9' })) }
    const res = await send(jordan, { env: { EMAIL: email, EMAIL_FROM: 'notifications@resspark.com' } })
    const body = (await res.json()) as { url: string; email: unknown }
    expect(body.email).toEqual({ ok: true, id: 'msg_9' })
    expect(email.send).toHaveBeenCalledTimes(1)
    expect(email.send.mock.calls[0][0].to).toBe('jordan.rivera@example.com')
    expect(email.send.mock.calls[0][0].text).toContain(body.url)
    expect(logEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'request.email_sent' }))
  })

  it('still returns the link when email is not set up, reporting not_configured', async () => {
    const res = await send(jordan)
    expect(res.status).toBe(200)
    expect(((await res.json()) as { email: unknown }).email).toEqual({ ok: false, reason: 'not_configured' })
  })

  it('refuses a typo-flagged email with the suggestion', async () => {
    const res = await send({ email: 'jordan@gmial.com', phone: '5550100001' })
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: { code: string }; email_suggestion: string }
    expect(body.error.code).toBe('contact_flagged')
    expect(body.email_suggestion).toBe('jordan@gmail.com')
    expect(sendRequest).not.toHaveBeenCalled()
  })

  it('sends a typo-flagged email when staff keep it, recording the override', async () => {
    const res = await send({ email: 'jordan@gmial.com', phone: '5550100001', keep_flagged: true })
    expect(res.status).toBe(200)
    expect(vi.mocked(sendRequest).mock.calls[0][1].payload.contact_overridden).toBe(true)
  })

  it('refuses an email that differs from the Logics-held value', async () => {
    const res = await send({ email: 'other@example.com', phone: '5550100001' })
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: { code: string }; differs: string[] }
    expect(body.error.code).toBe('contact_flagged')
    expect(body.differs).toEqual(['email'])
    expect(sendRequest).not.toHaveBeenCalled()
  })

  it('sends to a different email when staff keep it', async () => {
    const res = await send({ email: 'other@example.com', phone: '5550100001', keep_flagged: true })
    expect(res.status).toBe(200)
    expect(vi.mocked(sendRequest).mock.calls[0][1].contact_email).toBe('other@example.com')
  })

  it('returns both field errors for empty contact fields', async () => {
    const res = await send({ email: '', phone: '' })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string }; email_error: string; phone_error: string }
    expect(body.error.code).toBe('contact_invalid')
    expect(body.email_error).toBeTruthy()
    expect(body.phone_error).toBeTruthy()
    expect(sendRequest).not.toHaveBeenCalled()
  })

  it('refuses non-string contact fields', async () => {
    const res = await send({ email: 5, phone: null })
    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('bad_request')
  })

  it('refuses with case_changed when the cached name differs from fresh CaseInfo', async () => {
    vi.mocked(getRequest).mockResolvedValue(bundle({ case: caseRow({ first_name: 'Jordana' }) }))
    const res = await send(jordan)
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: { code: string }; changed: string[] }
    expect(body.error.code).toBe('case_changed')
    expect(body.changed).toContain('first_name')
    expect(sendRequest).not.toHaveBeenCalled()
  })

  it('refuses with case_changed when Logics no longer has the case', async () => {
    vi.mocked(getRequest).mockResolvedValue(bundle({ case: caseRow({ logics_case_id: 1 }) }))
    const res = await send(jordan)
    expect(res.status).toBe(409)
    expect(await errorCode(res)).toBe('case_changed')
    expect(sendRequest).not.toHaveBeenCalled()
  })

  it('maps request_not_draft from the RPC to 409', async () => {
    vi.mocked(sendRequest).mockRejectedValue(new Error('request_not_draft'))
    const res = await send(jordan)
    expect(res.status).toBe(409)
    expect(await errorCode(res)).toBe('request_not_draft')
  })

  it('is 409 logics_not_configured in live mode without tested credentials', async () => {
    const res = await send(jordan, { env: { LOGICS_MODE: 'live' } })
    expect(res.status).toBe(409)
    expect(await errorCode(res)).toBe('logics_not_configured')
    expect(sendRequest).not.toHaveBeenCalled()
  })

  it('verifies the staff token once although two sub-apps share the prefix', async () => {
    vi.mocked(getStaffProfile).mockClear()
    await send(jordan)
    expect(getStaffProfile).toHaveBeenCalledTimes(1)
  })

  it('is 404 for a request outside the firm', async () => {
    vi.mocked(getRequest).mockResolvedValue(null)
    const res = await send(jordan)
    expect(res.status).toBe(404)
  })
})
