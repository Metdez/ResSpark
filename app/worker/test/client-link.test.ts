import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hmacKey, mintLinkToken, uuidToBytes, type ClientLinkRow } from '../src/auth/client-link'
import { createAdminClient } from '../src/db/client'
import { createClientLink, findClientLink } from '../src/db/client-links'
import { app } from '../src/index'
import { _resetRateLimitForTests } from '../src/middleware/link-rate-limit'

vi.mock('../src/db/client-links', () => ({ findClientLink: vi.fn(), createClientLink: vi.fn() }))
vi.mock('../src/db/client', () => ({ createAdminClient: vi.fn() }))

const SECRET = 'route-test-client-link-secret'
const ID = '0f8b2c4e-1a2b-4c3d-8e9f-a0b1c2d3e4f5'
const REQUEST_ID = '22222222-3333-4444-8555-666666666666'
const DAY = 86_400_000
const ENV = {
  CLIENT_LINK_HMAC_KEY: SECRET,
  SUPABASE_URL: 'https://unit.supabase.test',
  SUPABASE_SECRET_KEY: 'sb_secret_unit',
  ASSETS: {
    fetch: async () =>
      new Response('<div id="root"></div>', { headers: { 'content-type': 'text/html' } }),
  },
} as unknown as Env

const row = (over: Partial<ClientLinkRow> = {}): ClientLinkRow => ({
  id: ID,
  firm_id: '00000000-0000-0000-0000-000000000001',
  request_id: REQUEST_ID,
  version: 1,
  expires_at: new Date(Date.now() + DAY).toISOString(),
  revoked_at: null,
  opened_at: null,
  ...over,
})
const mint = async (version = 1) => mintLinkToken(await hmacKey(SECRET), uuidToBytes(ID), version)
const get = (token: string) => app.request(`/c/${token}`, {}, ENV)
const tampered = async () => {
  const raw = Buffer.from(await mint(), 'base64url')
  raw[47] ^= 0x80
  return raw.toString('base64url')
}
const random64 = () =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(48))).toString('base64url')

beforeEach(() => {
  _resetRateLimitForTests()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.mocked(findClientLink).mockResolvedValue(row())
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(findClientLink).mockReset()
})

describe('GET /c/:token with a valid token', () => {
  it('sets the signed rs_client cookie and redirects to /c/', async () => {
    const token = await mint()
    const res = await get(token)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/c/')
    const cookie = res.headers.get('set-cookie') ?? ''
    for (const part of ['rs_client=', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=86400', 'Path=/']) {
      expect(cookie).toContain(part)
    }
    expect(cookie).not.toContain(token)
    expect(await res.text()).not.toContain(token)
  })

  it('carries no-store, no-referrer and noindex on the 302', async () => {
    const res = await get(await mint())
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    expect(res.headers.get('x-robots-tag')).toBe('noindex')
  })

  it('never writes to the database (opened_at stays untouched)', async () => {
    const r = row()
    vi.mocked(findClientLink).mockResolvedValue(r)
    await get(await mint())
    expect(r.opened_at).toBeNull()
    expect(createClientLink).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
  })
})

describe('GET /c/:token failures are one uniform 404', () => {
  const cases: [string, () => Promise<string>, ClientLinkRow | null][] = [
    ['malformed', async () => 'not-a-token', row()],
    ['random 64 chars', async () => random64(), null],
    ['tampered MAC', tampered, row()],
    ['revoked', () => mint(), row({ revoked_at: new Date().toISOString() })],
    ['expired', () => mint(), row({ expires_at: new Date(Date.now() - 1000).toISOString() })],
  ]

  it.each(cases)('%s → 404 invalid-link page without the token', async (_name, token, found) => {
    vi.mocked(findClientLink).mockResolvedValue(found)
    const t = await token()
    const res = await get(t)
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = await res.text()
    expect(body).toContain("This link isn't active")
    expect(body).toContain('Ask your agent for a new link.')
    expect(body).not.toContain(t)
    expect(body).not.toContain(REQUEST_ID)
  })

  it('returns byte-identical bodies for every failure', async () => {
    const bodies = new Set<string>()
    for (const [, token, found] of cases) {
      vi.mocked(findClientLink).mockResolvedValue(found)
      bodies.add(await (await get(await token())).text())
    }
    expect(bodies.size).toBe(1)
  })

  it('does not look up a wrong-length token', async () => {
    await get('not-a-token')
    await get((await mint()).slice(0, 60))
    expect(findClientLink).not.toHaveBeenCalled()
  })
})

describe('GET /c/:token rate limiting', () => {
  const fromIp = (token: string, ip: string, env: Env = ENV) =>
    app.request(`/c/${token}`, { headers: { 'cf-connecting-ip': ip } }, env)

  it('returns the 429 page before any lookup when the binding refuses', async () => {
    const env = { ...ENV, LINK_RATE_LIMITER: { limit: async () => ({ success: false }) } } as unknown as Env
    const res = await fromIp(await mint(), '203.0.113.5', env)
    expect(res.status).toBe(429)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.text()).toContain('Too many attempts')
    expect(findClientLink).not.toHaveBeenCalled()
  })

  it('without the binding, limits the 21st request per ip inside the window', async () => {
    const token = await mint()
    for (let i = 0; i < 20; i++) {
      expect((await fromIp(token, '203.0.113.9')).status).toBe(302)
    }
    const limited = await fromIp(token, '203.0.113.9')
    expect(limited.status).toBe(429)
    expect(limited.headers.get('cache-control')).toBe('no-store')
    expect((await fromIp(token, '203.0.113.10')).status).toBe(302)
  })
})
