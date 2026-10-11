import { Hono } from 'hono'
import { setSignedCookie } from 'hono/cookie'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { cookieSecret, hmacKey, mintLinkToken, uuidToBytes, type ClientLinkRow } from '../src/auth/client-link'
import { createAdminClient } from '../src/db/client'
import { findClientLink } from '../src/db/client-links'
import { getPortalState, openRequest, upsertClientSession, type PortalState } from '../src/db/portal'
import { app } from '../src/index'
import { _resetRateLimitForTests } from '../src/middleware/link-rate-limit'

vi.mock('../src/db/client-links', () => ({ findClientLink: vi.fn(), createClientLink: vi.fn() }))
vi.mock('../src/db/portal', () => ({ getPortalState: vi.fn(), openRequest: vi.fn(), upsertClientSession: vi.fn() }))
vi.mock('../src/db/events', () => ({ logEvent: vi.fn() }))
vi.mock('../src/db/client', () => ({ createAdminClient: vi.fn() }))

const SECRET = 'portal-test-client-link-secret'
const LINK = '44444444-5555-4666-8777-888888888888'
const LINK2 = '55555555-6666-4777-8888-999999999999'
const REQ = '33333333-4444-4555-8666-777777777777'
const FIRM = '00000000-0000-0000-0000-000000000001'
const OPENED = '2026-10-11T08:00:00.000Z'
const DAY = 86_400_000
const ENV = {
  CLIENT_LINK_HMAC_KEY: SECRET,
  SUPABASE_URL: 'https://portal.supabase.test',
  SUPABASE_SECRET_KEY: 'sb_secret_unit',
  ASSETS: { fetch: async () => new Response('<div id="root"></div>') },
} as unknown as Env

const row = (over: Partial<ClientLinkRow> = {}): ClientLinkRow => ({
  id: LINK,
  firm_id: FIRM,
  request_id: REQ,
  version: 1,
  expires_at: new Date(Date.now() + 14 * DAY).toISOString(),
  revoked_at: null,
  opened_at: null,
  ...over,
})

const KINDS = ['bank_connect', 'payroll_connect', 'address', 'upload', 'signature'] as const
const STATE: PortalState = {
  firm_name: 'ValorTax',
  agent_display_name: 'Zack H.',
  status: 'sent',
  opened_at: null,
  expires_at: row().expires_at,
  steps: KINDS.map((kind, i) => ({
    id: `00000000-0000-4000-8000-00000000000${i + 1}`,
    position: i + 1,
    kind,
    label: `Step ${i + 1}`,
    required: true,
    status: 'pending' as const,
  })),
}

const cookiePair = (res: Response) => (res.headers.get('set-cookie') ?? '').split(';')[0]

// Phase 1's real exchange: GET /c/<minted token> → 302 + rs_client.
async function exchange(id = LINK): Promise<string> {
  const token = await mintLinkToken(await hmacKey(SECRET), uuidToBytes(id), 1)
  const res = await app.request(`/c/${token}`, {}, ENV)
  expect(res.status).toBe(302)
  expect(res.headers.get('set-cookie')).toContain('rs_client=')
  return cookiePair(res)
}

// Signs an arbitrary rs_client value with Hono's own setSignedCookie (no hand-rolled HMAC).
async function signedCookie(value: string): Promise<string> {
  const signer = new Hono().get('/', async (c) => {
    await setSignedCookie(c, 'rs_client', value, await cookieSecret(SECRET), { path: '/' })
    return c.text('')
  })
  return cookiePair(await signer.request('/'))
}

const getState = (cookie?: string) =>
  app.request('/api/c/state', { headers: cookie ? { cookie } : {} }, ENV)

const post = (path: string, cookie?: string, body?: unknown, header = true) => {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (cookie) headers.cookie = cookie
  if (header) headers['x-requested-with'] = 'ResSpark'
  return app.request(path, { method: 'POST', headers, body: JSON.stringify(body ?? {}) }, ENV)
}

const errorCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code

function expectPrivacy(res: Response) {
  expect(res.headers.get('cache-control')).toBe('no-store')
  expect(res.headers.get('x-robots-tag')).toBe('noindex')
  expect(res.headers.get('referrer-policy')).toBe('no-referrer')
}

let logSpy: MockInstance<(...args: unknown[]) => void>

beforeEach(() => {
  _resetRateLimitForTests()
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.mocked(findClientLink).mockImplementation(async (_env, id) =>
    Buffer.from(id).toString('hex') === LINK2.replace(/-/g, '') ? row({ id: LINK2 }) : row()
  )
  vi.mocked(getPortalState).mockResolvedValue(STATE)
  vi.mocked(openRequest).mockResolvedValue(OPENED)
  vi.mocked(upsertClientSession).mockResolvedValue()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(findClientLink).mockReset()
  vi.mocked(getPortalState).mockReset()
  vi.mocked(openRequest).mockReset()
  vi.mocked(upsertClientSession).mockReset()
})

describe('GET /api/c/state', () => {
  it('returns the allow-listed portal state for the cookie session', async () => {
    const res = await getState(await exchange())
    expect(res.status).toBe(200)
    expectPrivacy(res)
    const body = (await res.json()) as PortalState
    expect(Object.keys(body).sort()).toEqual(
      ['agent_display_name', 'expires_at', 'firm_name', 'opened_at', 'status', 'steps'].sort()
    )
    expect(body.steps.map((s) => s.position)).toEqual([1, 2, 3, 4, 5])
    for (const step of body.steps) {
      expect(Object.keys(step).sort()).toEqual(['id', 'kind', 'label', 'position', 'required', 'status'])
    }
    expect(getPortalState).toHaveBeenCalledWith(expect.anything(), {
      linkId: LINK,
      requestId: REQ,
      firmId: FIRM,
      expiresAt: expect.any(String),
      openedAt: null,
    })
  })

  it('leaks no contact fields or identifiers', async () => {
    const text = await (await getState(await exchange())).text()
    for (const word of ['email', 'phone', 'case_id', 'request_id', 'firm_id', REQ, FIRM, LINK]) {
      expect(text).not.toContain(word)
    }
  })

  it('reads identity only from the cookie, never from the query', async () => {
    const cookie = await exchange()
    await app.request(`/api/c/state?link_id=${LINK2}&request_id=other`, { headers: { cookie } }, ENV)
    expect(vi.mocked(getPortalState).mock.calls[0][1].linkId).toBe(LINK)
  })

  it('returns 401 no_session when the request behind the link is gone', async () => {
    vi.mocked(getPortalState).mockResolvedValue(null)
    const res = await getState(await exchange())
    expect(res.status).toBe(401)
    expect(await errorCode(res)).toBe('no_session')
  })
})

describe('session failures are one uniform 401', () => {
  const tamper = (cookie: string) => {
    const at = cookie.length - 10 // inside the signature, clear of base64 padding bits
    return cookie.slice(0, at) + (cookie[at] === 'A' ? 'B' : 'A') + cookie.slice(at + 1)
  }
  const cases: [string, () => Promise<string | undefined>, ClientLinkRow | null][] = [
    ['missing cookie', async () => undefined, row()],
    ['altered signature', async () => tamper(await exchange()), row()],
    ['revoked link', () => exchange(), row({ revoked_at: new Date().toISOString() })],
    ['expired link', () => exchange(), row({ expires_at: new Date(Date.now() - 1000).toISOString() })],
    ['unknown link', () => exchange(), null],
    ['expired cookie', () => signedCookie(JSON.stringify({ link_id: LINK, exp: Date.now() - 1 })), row()],
    ['non-JSON payload', () => signedCookie('not-json'), row()],
    ['bad link_id', () => signedCookie(JSON.stringify({ link_id: 'x', exp: Date.now() + DAY })), row()],
  ]

  it.each(cases)('%s → 401 no_session with privacy headers', async (_name, cookie, found) => {
    const c = await cookie()
    vi.mocked(findClientLink).mockResolvedValue(found)
    const res = await getState(c)
    expect(res.status).toBe(401)
    expectPrivacy(res)
    expect(await errorCode(res)).toBe('no_session')
    expect(getPortalState).not.toHaveBeenCalled()
  })

  it('returns byte-identical bodies for every failure', async () => {
    const bodies = new Set<string>()
    for (const [, cookie, found] of cases) {
      vi.mocked(findClientLink).mockResolvedValue(row())
      const c = await cookie()
      vi.mocked(findClientLink).mockResolvedValue(found)
      bodies.add(await (await getState(c)).text())
    }
    expect(bodies.size).toBe(1)
  })
})

describe('POST /api/c/start', () => {
  it('refuses without X-Requested-With: ResSpark (403 bad_origin) and opens nothing', async () => {
    const res = await post('/api/c/start', await exchange(), {}, false)
    expect(res.status).toBe(403)
    expectPrivacy(res)
    expect(await errorCode(res)).toBe('bad_origin')
    expect(openRequest).not.toHaveBeenCalled()
  })

  it('opens the cookie link only, ignoring ids in the body', async () => {
    const res = await post('/api/c/start', await exchange(), { request_id: 'other', link_id: LINK2 })
    expect(res.status).toBe(200)
    expectPrivacy(res)
    expect(await res.json()).toEqual({ opened_at: OPENED })
    expect(openRequest).toHaveBeenCalledTimes(1)
    expect(vi.mocked(openRequest).mock.calls[0][1]).toBe(LINK)
  })

  it('is idempotent: a second call returns the same opened_at', async () => {
    const cookie = await exchange()
    const first = await (await post('/api/c/start', cookie)).json()
    const second = await (await post('/api/c/start', cookie)).json()
    expect(openRequest).toHaveBeenCalledTimes(2)
    expect(second).toEqual(first)
  })

  it('maps link_inactive from request_open to 401 no_session', async () => {
    vi.mocked(openRequest).mockRejectedValue(new Error('link_inactive'))
    const res = await post('/api/c/start', await exchange())
    expect(res.status).toBe(401)
    expect(await errorCode(res)).toBe('no_session')
  })

  it('returns 401 before the header check when there is no cookie', async () => {
    const res = await post('/api/c/start', undefined, {}, false)
    expect(res.status).toBe(401)
    expect(openRequest).not.toHaveBeenCalled()
  })
})

describe('opening is explicit', () => {
  it('neither the exchange nor GET /api/c/state calls openRequest', async () => {
    const cookie = await exchange()
    await getState(cookie)
    expect(openRequest).not.toHaveBeenCalled()
  })

  it('logs route patterns and never the cookie value', async () => {
    const cookie = await exchange()
    await getState(cookie)
    await post('/api/c/start', cookie)
    const lines = logSpy.mock.calls.map((args) => String(args[0]))
    const routes = lines.map((l) => (JSON.parse(l) as { route: string }).route)
    expect(routes).toContain('/api/c/state')
    expect(routes).toContain('/api/c/start')
    const value = cookie.slice('rs_client='.length)
    for (const line of lines) expect(line).not.toContain(value)
  })
})

describe('db/portal', () => {
  const real = () => vi.importActual<typeof import('../src/db/portal')>('../src/db/portal')
  const CLIENT = { linkId: LINK, requestId: REQ, firmId: FIRM, expiresAt: '2099-01-01T00:00:00.000Z', openedAt: null }

  it('getPortalState scopes by request and firm, sorts steps, and allow-lists fields', async () => {
    const eq = vi.fn()
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn((col: string, val: string) => (eq(col, val), chain)),
      maybeSingle: vi.fn(async () => ({
        data: {
          status: 'sent',
          agent_display_name: 'Zack H.',
          contact_email: 'leak@example.com',
          firms: { name: 'ValorTax' },
          request_items: [
            { id: 'b', position: 2, kind: 'upload', label: 'ID', required: true, status: 'pending', config: { x: 1 } },
            { id: 'a', position: 1, kind: 'address', label: 'Addr', required: false, status: 'submitted' },
          ],
        },
        error: null,
      })),
    }
    vi.mocked(createAdminClient).mockReturnValue({ from: vi.fn(() => chain) } as never)
    const state = await (await real()).getPortalState(ENV, CLIENT)
    expect(eq).toHaveBeenCalledWith('id', REQ)
    expect(eq).toHaveBeenCalledWith('firm_id', FIRM)
    expect(state).toEqual({
      firm_name: 'ValorTax',
      agent_display_name: 'Zack H.',
      status: 'sent',
      opened_at: null,
      expires_at: '2099-01-01T00:00:00.000Z',
      steps: [
        { id: 'a', position: 1, kind: 'address', label: 'Addr', required: false, status: 'submitted' },
        { id: 'b', position: 2, kind: 'upload', label: 'ID', required: true, status: 'pending' },
      ],
    })
  })

  it('openRequest calls request_open with the link id and maps RPC tokens', async () => {
    const rpc = vi.fn(async () => ({ data: OPENED, error: null }))
    vi.mocked(createAdminClient).mockReturnValue({ rpc } as never)
    const portal = await real()
    expect(await portal.openRequest(ENV, LINK)).toBe(OPENED)
    expect(rpc).toHaveBeenCalledWith('request_open', { p_link_id: LINK })
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'link_inactive' } } as never)
    await expect(portal.openRequest(ENV, LINK)).rejects.toThrow('link_inactive')
  })
})
