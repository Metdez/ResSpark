import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyLinkToken } from '../src/auth/client-link'
import { logEvent } from '../src/db/events'
import { getRequest, regenerateLink, revokeRequest } from '../src/db/requests'
import { getStaffProfile } from '../src/db/staff'
import {
  call,
  CASE,
  clientLinkRow,
  env,
  errorCode,
  FIRM,
  initKeys,
  LINK,
  linkRow,
  ORIGIN,
  outboundCalls,
  REQ,
  sentBundle,
  stubFetch,
  SUB,
} from './requests-fixtures'

vi.mock('../src/db/staff', () => ({ getStaffProfile: vi.fn() }))
vi.mock('../src/db/events', () => ({ logEvent: vi.fn() }))
vi.mock('../src/db/integrations', () => ({ getIntegration: vi.fn() }))
vi.mock('../src/db/cases', () => ({ confirmLogicsCase: vi.fn(), getCase: vi.fn() }))
vi.mock('../src/db/requests', () => ({
  getTemplates: vi.fn(),
  createRequest: vi.fn(),
  getRequest: vi.fn(),
  sendRequest: vi.fn(),
  regenerateLink: vi.fn(),
  revokeRequest: vi.fn(),
}))

const action = (name: string, body?: unknown, opts?: { env?: Record<string, unknown> }) =>
  call('POST', `/api/admin/requests/${REQ}/${name}`, body, opts)
const staffEvent = { firm_id: FIRM, case_id: CASE, request_id: REQ, actor_type: 'staff', actor_id: SUB }

let fetchStub: ReturnType<typeof stubFetch>

beforeAll(initKeys)

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  fetchStub = stubFetch()
  vi.mocked(getStaffProfile).mockResolvedValue({ user_id: SUB, firm_id: FIRM, role: 'staff', display_name: 'Zack' })
  vi.mocked(getRequest).mockResolvedValue(sentBundle())
  vi.mocked(regenerateLink).mockResolvedValue({ link_id: LINK, version: 2, expires_at: '2026-10-25T00:00:00Z' })
  vi.mocked(revokeRequest).mockResolvedValue(undefined)
  vi.mocked(logEvent).mockResolvedValue(41)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  for (const f of [getRequest, regenerateLink, revokeRequest, logEvent]) vi.mocked(f).mockReset()
})

describe('POST /:id/regenerate', () => {
  it('returns a URL for the bumped version that the old version no longer verifies', async () => {
    const res = await action('regenerate')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { url: string; expires_at: string; version: number }
    expect(body.version).toBe(2)
    expect(body.expires_at).toBe('2026-10-25T00:00:00Z')
    const token = body.url.slice(ORIGIN.length)
    expect(await verifyLinkToken(env(), token, async () => clientLinkRow(2))).not.toBeNull()
    expect(await verifyLinkToken(env(), token, async () => clientLinkRow(1))).toBeNull()
    expect(regenerateLink).toHaveBeenCalledWith(expect.anything(), { request_id: REQ, firm_id: FIRM, actor_id: SUB })
  })

  it('maps request_not_active to 409', async () => {
    vi.mocked(regenerateLink).mockRejectedValue(new Error('request_not_active'))
    const res = await action('regenerate')
    expect(res.status).toBe(409)
    expect(await errorCode(res)).toBe('request_not_active')
  })
})

describe('POST /:id/revoke', () => {
  it('revokes as the staff user', async () => {
    const res = await action('revoke')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(revokeRequest).toHaveBeenCalledWith(expect.anything(), { request_id: REQ, firm_id: FIRM, actor_id: SUB })
  })

  it('maps a second revoke to 409 request_revoked', async () => {
    vi.mocked(revokeRequest).mockRejectedValue(new Error('request_revoked'))
    const res = await action('revoke')
    expect(res.status).toBe(409)
    expect(await errorCode(res)).toBe('request_revoked')
  })
})

describe('POST /:id/consent', () => {
  it('logs consent.sms with the agent id and the destination number', async () => {
    const res = await action('consent', { agreed: true })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, event_id: 41 })
    expect(logEvent).toHaveBeenCalledWith(expect.anything(), {
      ...staffEvent,
      action: 'consent.sms',
      payload: { phone_e164: '+15550100001' },
    })
  })

  it('logs one event per call', async () => {
    await action('consent', { agreed: true })
    await action('consent', { agreed: true })
    expect(logEvent).toHaveBeenCalledTimes(2)
  })

  it.each([[{ agreed: false }], [{ agreed: 'true' }], [{}]])('refuses %j with 400 bad_request', async (body) => {
    const res = await action('consent', body)
    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('bad_request')
    expect(logEvent).not.toHaveBeenCalled()
  })
})

describe('POST /:id/copied', () => {
  it('logs request.link_copied as the staff user with an empty payload', async () => {
    const res = await action('copied')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, event_id: 41 })
    expect(logEvent).toHaveBeenCalledWith(expect.anything(), { ...staffEvent, action: 'request.link_copied', payload: {} })
  })

  it('logs one event per call', async () => {
    await action('copied')
    await action('copied')
    expect(logEvent).toHaveBeenCalledTimes(2)
  })

  it('never calls out of the Worker for consent or copied', async () => {
    await action('consent', { agreed: true })
    await action('copied')
    expect(outboundCalls(fetchStub)).toHaveLength(0)
  })
})

describe('firm scoping', () => {
  it.each(['regenerate', 'revoke', 'consent', 'copied'])('%s is 404 for a request outside the firm', async (name) => {
    vi.mocked(getRequest).mockResolvedValue(null)
    const res = await action(name, { agreed: true })
    expect(res.status).toBe(404)
    expect(regenerateLink).not.toHaveBeenCalled()
    expect(revokeRequest).not.toHaveBeenCalled()
    expect(logEvent).not.toHaveBeenCalled()
  })
})

describe('POST /:id/email', () => {
  const resendOk = () =>
    stubFetch(async (url) =>
      url === 'https://api.resend.com/emails'
        ? new Response(JSON.stringify({ id: 'em_1' }), { status: 200 })
        : new Response('{}', { status: 500 })
    )
  const withKey = { env: { RESEND_API_KEY: 're_x' } }

  it('sends to the stored contact, never a body-supplied address, and logs request.email_sent', async () => {
    const f = resendOk()
    const res = await action('email', { to: 'attacker@example.com' }, withKey)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, id: 'em_1' })
    const [, init] = outboundCalls(f)[0]
    expect(JSON.parse(String(init?.body)).to).toEqual(['jordan.rivera@example.com'])
    expect(logEvent).toHaveBeenCalledWith(expect.anything(), {
      ...staffEvent,
      action: 'request.email_sent',
      payload: { to: 'jordan.rivera@example.com', resend_id: 'em_1' },
    })
  })

  it('reports not_configured without a Resend key and makes no outbound call', async () => {
    const f = resendOk()
    const res = await action('email')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: false, reason: 'not_configured' })
    expect(outboundCalls(f)).toHaveLength(0)
  })

  it('reports send_failed on a Resend error and logs request.email_failed', async () => {
    stubFetch(async () => new Response('{}', { status: 500 }))
    const res = await action('email', undefined, withKey)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: false, reason: 'send_failed' })
    expect(logEvent).toHaveBeenCalledWith(expect.anything(), {
      ...staffEvent,
      action: 'request.email_failed',
      payload: { to: 'jordan.rivera@example.com', reason: 'send_failed' },
    })
  })

  it.each([
    ['a revoked link', linkRow({ revoked_at: '2026-10-11T01:00:00Z' })],
    ['no link', null],
  ])('reports no_link for %s without calling Resend', async (_name, link) => {
    vi.mocked(getRequest).mockResolvedValue(sentBundle(link))
    const f = resendOk()
    const res = await action('email', undefined, withKey)
    expect(await res.json()).toEqual({ ok: false, reason: 'no_link' })
    expect(outboundCalls(f)).toHaveLength(0)
  })

  it('is 404 for a request outside the firm', async () => {
    vi.mocked(getRequest).mockResolvedValue(null)
    const res = await action('email', undefined, withKey)
    expect(res.status).toBe(404)
  })
})
