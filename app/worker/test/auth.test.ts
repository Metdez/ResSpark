import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from 'jose'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { logEvent } from '../src/db/events'
import { getStaffProfile } from '../src/db/staff'
import { app } from '../src/index'

vi.mock('../src/db/staff', () => ({ getStaffProfile: vi.fn() }))
vi.mock('../src/db/events', () => ({ logEvent: vi.fn() }))

const FIRM = '00000000-0000-0000-0000-000000000001'
const SUB = '11111111-2222-4333-8444-555555555555'
// Distinct project URLs per JWKS so the module-scope key-set cache never mixes them.
const GOOD_URL = 'https://good.supabase.test'
const FOREIGN_URL = 'https://foreign.supabase.test'
const envFor = (url: string) =>
  ({ SUPABASE_URL: url, SUPABASE_SECRET_KEY: 'sb_secret_unit' }) as unknown as Env

let projectKey: CryptoKey
let foreignKey: CryptoKey
let projectJwks: unknown
let foreignJwks: unknown

async function token(
  key: CryptoKey,
  opts: { iss?: string; aud?: string; firm?: string } = {}
): Promise<string> {
  return new SignJWT({
    email: 'zack@resspark.test',
    role: 'authenticated',
    app_metadata: { firm_id: opts.firm ?? FIRM, role: 'admin' },
  })
    .setProtectedHeader({ alg: 'ES256', kid: key === projectKey ? 'project' : 'foreign' })
    .setSubject(SUB)
    .setIssuer(opts.iss ?? `${GOOD_URL}/auth/v1`)
    .setAudience(opts.aud ?? 'authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key)
}

const post = (headers: Record<string, string>, body?: string, url = GOOD_URL) =>
  app.request('/api/admin/session', { method: 'POST', headers, body }, envFor(url))
const json = { 'content-type': 'application/json' }
const bearer = (t: string) => ({ ...json, authorization: `Bearer ${t}` })

beforeAll(async () => {
  const project = await generateKeyPair('ES256')
  const foreign = await generateKeyPair('ES256')
  projectKey = project.privateKey
  foreignKey = foreign.privateKey
  projectJwks = { keys: [{ ...(await exportJWK(project.publicKey)), kid: 'project', alg: 'ES256' }] }
  // The foreign project's JWKS serves an unrelated key under the same kid as the token.
  const other = await generateKeyPair('ES256')
  foreignJwks = { keys: [{ ...(await exportJWK(other.publicKey)), kid: 'foreign', alg: 'ES256' }] }
})

let logLines: string[] = []
beforeEach(() => {
  logLines = []
  vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
    logLines.push(String(line))
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input)
      const body = url.startsWith(FOREIGN_URL) ? foreignJwks : projectJwks
      return new Response(JSON.stringify(body), { headers: json })
    })
  )
  vi.mocked(getStaffProfile).mockResolvedValue({
    user_id: SUB,
    firm_id: FIRM,
    role: 'admin',
    display_name: 'Zack',
  })
  vi.mocked(logEvent).mockResolvedValue(42)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.mocked(getStaffProfile).mockReset()
  vi.mocked(logEvent).mockReset()
})

const errorCode = async (res: Response) =>
  ((await res.json()) as { error: { code: string } }).error.code

describe('staffAuth rejects missing and invalid tokens', () => {
  it('POST without authorization is 401 unauthorized, with a request id and a clean log line', async () => {
    const res = await post(json, JSON.stringify({ event: 'signed_in' }))
    expect(res.status).toBe(401)
    expect(await errorCode(res)).toBe('unauthorized')
    expect(res.headers.get('X-Request-Id')).toBeTruthy()
    const line = JSON.parse(logLines.at(-1)!) as Record<string, unknown>
    expect(line.error_code).toBe('unauthorized')
    expect(logLines.join('\n').toLowerCase()).not.toContain('authorization')
  })

  it('GET without authorization is 401', async () => {
    const res = await app.request('/api/admin/session', {}, envFor(GOOD_URL))
    expect(res.status).toBe(401)
    expect(await errorCode(res)).toBe('unauthorized')
  })

  it('a malformed bearer token is 401 before any key fetch', async () => {
    const res = await post(bearer('not.a.jwt'), JSON.stringify({ event: 'signed_in' }))
    expect(res.status).toBe(401)
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('a token whose key is not in the project JWKS is 401', async () => {
    const t = await token(foreignKey, { iss: `${FOREIGN_URL}/auth/v1` })
    const res = await post(bearer(t), JSON.stringify({ event: 'signed_in' }), FOREIGN_URL)
    expect(res.status).toBe(401)
    expect(getStaffProfile).not.toHaveBeenCalled()
  })

  it('a project-signed token with the wrong issuer is 401', async () => {
    const t = await token(projectKey, { iss: 'https://evil.example/auth/v1' })
    const res = await post(bearer(t), JSON.stringify({ event: 'signed_in' }))
    expect(res.status).toBe(401)
  })

  it('a project-signed token with the wrong audience is 401', async () => {
    const t = await token(projectKey, { aud: 'anon' })
    const res = await post(bearer(t), JSON.stringify({ event: 'signed_in' }))
    expect(res.status).toBe(401)
  })
})

describe('staffAuth scopes verified users to their staff profile', () => {
  it('no staff_profiles row is 403 forbidden', async () => {
    vi.mocked(getStaffProfile).mockResolvedValue(null)
    const res = await post(bearer(await token(projectKey)), JSON.stringify({ event: 'signed_in' }))
    expect(res.status).toBe(403)
    expect(await errorCode(res)).toBe('forbidden')
    expect(getStaffProfile).toHaveBeenCalledWith(expect.anything(), SUB)
  })

  it('a profile in another firm than app_metadata.firm_id is 403', async () => {
    vi.mocked(getStaffProfile).mockResolvedValue({
      user_id: SUB,
      firm_id: '00000000-0000-0000-0000-000000000009',
      role: 'admin',
      display_name: 'Zack',
    })
    const res = await post(bearer(await token(projectKey)), JSON.stringify({ event: 'signed_in' }))
    expect(res.status).toBe(403)
    expect(logEvent).not.toHaveBeenCalled()
  })
})

describe('/api/admin/session', () => {
  it('POST signed_in writes staff.signed_in through logEvent and returns the id', async () => {
    const res = await post(bearer(await token(projectKey)), JSON.stringify({ event: 'signed_in' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, event_id: 42 })
    expect(logEvent).toHaveBeenCalledWith(expect.anything(), {
      firm_id: FIRM,
      actor_type: 'staff',
      actor_id: SUB,
      action: 'staff.signed_in',
    })
  })

  it('ignores firm_id and actor fields in the body', async () => {
    const body = JSON.stringify({ event: 'signed_out', firm_id: 'other', actor_id: 'other' })
    const res = await post(bearer(await token(projectKey)), body)
    expect(res.status).toBe(200)
    expect(logEvent).toHaveBeenCalledWith(expect.anything(), {
      firm_id: FIRM,
      actor_type: 'staff',
      actor_id: SUB,
      action: 'staff.signed_out',
    })
  })

  it.each([
    ['an unknown event', JSON.stringify({ event: 'nope' })],
    ['an empty body', undefined],
    ['a non-JSON body', 'signed_in'],
  ])('POST with %s is 400 bad_request and writes nothing', async (_name, body) => {
    const res = await post(bearer(await token(projectKey)), body)
    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('bad_request')
    expect(logEvent).not.toHaveBeenCalled()
  })

  it('GET returns the verified identity from the profile', async () => {
    const res = await app.request(
      '/api/admin/session',
      { headers: bearer(await token(projectKey)) },
      envFor(GOOD_URL)
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      user_id: SUB,
      firm_id: FIRM,
      role: 'admin',
      display_name: 'Zack',
      email: 'zack@resspark.test',
    })
  })
})
