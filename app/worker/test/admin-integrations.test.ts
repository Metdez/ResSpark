import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from 'jose'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { logEvent } from '../src/db/events'
import {
  getIntegration,
  recordIntegrationTest,
  upsertIntegration,
  type FirmIntegrationRow,
} from '../src/db/integrations'
import { getStaffProfile } from '../src/db/staff'
import { app } from '../src/index'
import { decryptSecret, encryptSecret } from '../src/integrations/credential-crypto'
import { DEFAULT_LOGICS_BASE_URL } from '../src/integrations/logics/config'

vi.mock('../src/db/staff', () => ({ getStaffProfile: vi.fn() }))
vi.mock('../src/db/events', () => ({ logEvent: vi.fn() }))
vi.mock('../src/db/integrations', async (orig) => ({
  ...(await orig<typeof import('../src/db/integrations')>()),
  getIntegration: vi.fn(),
  upsertIntegration: vi.fn(),
  recordIntegrationTest: vi.fn(),
  updateSettings: vi.fn(),
}))

const FIRM = '00000000-0000-0000-0000-000000000001'
const ADMIN = '11111111-2222-4333-8444-555555555555'
const STAFF = '11111111-2222-4333-8444-666666666666'
const EMAILS: Record<string, string> = { [ADMIN]: 'zack@resspark.test', [STAFF]: 'andrew@resspark.test' }
const SUPA = 'https://integrations.supabase.test'
const KEY = '00'.repeat(32)
const env = (mode = 'fake') =>
  ({
    SUPABASE_URL: SUPA,
    SUPABASE_SECRET_KEY: 'unit',
    LOGICS_MODE: mode,
    INTEGRATION_ENC_KEY: KEY,
    APP_ENV: 'sandbox',
  }) as unknown as Env

let signingKey: CryptoKey
let jwks: unknown
let row: FirmIntegrationRow | null
let logicsResponse: () => Promise<Response>
let outbound: { url: string; headers: Record<string, string> }[]

// Staff fabrication lifted from auth.test.ts (local per the plan; extract once a fourth file needs it).
async function token(sub: string): Promise<string> {
  return new SignJWT({ email: EMAILS[sub], role: 'authenticated', app_metadata: { firm_id: FIRM } })
    .setProtectedHeader({ alg: 'ES256', kid: 'k' })
    .setSubject(sub)
    .setIssuer(`${SUPA}/auth/v1`)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(signingKey)
}

const call = async (method: string, path: string, opts: { as?: string; body?: unknown; mode?: string } = {}) => {
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${await token(opts.as ?? ADMIN)}` }
  const body = opts.body === undefined ? undefined : JSON.stringify(opts.body)
  return app.request(`/api/admin/integrations${path}`, { method, headers, body }, env(opts.mode))
}
const put = (body: unknown, as = ADMIN) => call('PUT', '/logics', { as, body })
const runTest = (as = ADMIN) => call('POST', '/logics/test', { as })
const errorCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code

async function storedRow(over: Partial<FirmIntegrationRow> = {}): Promise<FirmIntegrationRow> {
  return {
    id: 'row',
    firm_id: FIRM,
    provider: 'logics',
    base_url: DEFAULT_LOGICS_BASE_URL,
    api_key_ciphertext: await encryptSecret(KEY, 'api-key'),
    secret_ciphertext: await encryptSecret(KEY, 'secret'),
    key_hint: '-key',
    last_test_at: null,
    last_test_ok: null,
    updated_by: ADMIN,
    updated_at: '2026-10-11T00:00:00Z',
    ...over,
  }
}

beforeAll(async () => {
  const pair = await generateKeyPair('ES256')
  signingKey = pair.privateKey
  jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k', alg: 'ES256' }] }
})

beforeEach(() => {
  row = null
  outbound = []
  vi.spyOn(console, 'log').mockImplementation(() => {})
  logicsResponse = async () => new Response(JSON.stringify({ Success: true, data: [] }))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.startsWith(SUPA)) return new Response(JSON.stringify(jwks))
      outbound.push({ url, headers: (init?.headers ?? {}) as Record<string, string> })
      return logicsResponse()
    })
  )
  vi.mocked(getStaffProfile).mockImplementation(async (_env, userId) => ({
    user_id: userId,
    firm_id: FIRM,
    role: userId === ADMIN ? 'admin' : 'staff',
    display_name: userId === ADMIN ? 'Zack' : 'Andrew',
  }))
  vi.mocked(getIntegration).mockImplementation(async () => row)
  vi.mocked(upsertIntegration).mockImplementation(async (_env, input) => {
    row = { id: 'row', ...input, last_test_ok: null, last_test_at: null, updated_at: '2026-10-11T01:00:00Z' }
    return row
  })
  vi.mocked(recordIntegrationTest).mockResolvedValue(undefined)
  vi.mocked(logEvent).mockResolvedValue(7)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  for (const fn of [getIntegration, upsertIntegration, recordIntegrationTest, logEvent]) vi.mocked(fn).mockReset()
})

describe('GET /api/admin/integrations/logics', () => {
  it('reports an unconfigured firm in fake mode, readable by staff', async () => {
    const res = await call('GET', '/logics', { as: STAFF })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      configured: false,
      base_url: DEFAULT_LOGICS_BASE_URL,
      key_hint: null,
      last_test_at: null,
      last_test_ok: null,
      updated_at: null,
      mode: 'fake',
      settings: { file_category_id: null, activity_type: 'General', write_enabled: false },
      activity_types: [],
    })
  })

  it('reports mode live with a tested row in live mode, and no ciphertext', async () => {
    row = await storedRow({ last_test_ok: true, last_test_at: '2026-10-11T02:00:00Z' })
    const res = await call('GET', '/logics', { mode: 'live' })
    const text = await res.text()
    expect(JSON.parse(text)).toMatchObject({ configured: true, last_test_ok: true, key_hint: '-key', mode: 'live' })
    expect(text).not.toContain('_ciphertext')
    expect(text).not.toContain(row.api_key_ciphertext)
  })
})

describe('PUT /api/admin/integrations/logics', () => {
  it('is 403 forbidden for a staff role and writes nothing', async () => {
    const res = await put({ api_key: 'ABCD1234', secret_token: 'S' }, STAFF)
    expect(res.status).toBe(403)
    expect(await errorCode(res)).toBe('forbidden')
    expect(upsertIntegration).not.toHaveBeenCalled()
  })

  it('encrypts both values, stores the key hint, and echoes no secret', async () => {
    const res = await put({ api_key: 'ABCD1234', secret_token: 'S' })
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(JSON.parse(text)).toMatchObject({
      configured: true,
      key_hint: '1234',
      base_url: DEFAULT_LOGICS_BASE_URL,
      last_test_ok: null,
      mode: 'fake',
    })
    expect(text).not.toContain('ABCD1234')
    expect(text).not.toContain('_ciphertext')
    expect(Object.values(JSON.parse(text) as Record<string, unknown>)).not.toContain('S')
    const input = vi.mocked(upsertIntegration).mock.calls[0][1]
    expect(input.api_key_ciphertext).not.toBe('ABCD1234')
    expect(input.secret_ciphertext).not.toBe('S')
    expect(await decryptSecret(KEY, input.api_key_ciphertext)).toBe('ABCD1234')
    expect(input.updated_by).toBe(ADMIN)
    expect(input.firm_id).toBe(FIRM)
  })

  it.each([
    ['an empty api_key', { api_key: '', secret_token: 'S' }],
    ['a blank secret_token', { api_key: 'ABCD1234', secret_token: '  ' }],
    ['a non-string base_url', { api_key: 'ABCD1234', secret_token: 'S', base_url: 5 }],
    ['no body', undefined],
  ])('is 400 bad_request for %s', async (_name, body) => {
    const res = await put(body)
    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('bad_request')
    expect(upsertIntegration).not.toHaveBeenCalled()
  })

  it('is 400 invalid_base_url for a non-https host', async () => {
    const res = await put({ api_key: 'ABCD1234', secret_token: 'S', base_url: 'http://evil.example/' })
    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('invalid_base_url')
    expect(upsertIntegration).not.toHaveBeenCalled()
  })

  it('normalizes a base URL to one trailing slash', async () => {
    await put({ api_key: 'ABCD1234', secret_token: 'S', base_url: 'https://valortax.logiqsapi.com/publicapi/V4' })
    expect(vi.mocked(upsertIntegration).mock.calls[0][1].base_url).toBe('https://valortax.logiqsapi.com/publicapi/V4/')
  })
})

describe('POST /api/admin/integrations/logics/test', () => {
  it('is 403 forbidden for a staff role', async () => {
    row = await storedRow()
    const res = await runTest(STAFF)
    expect(res.status).toBe(403)
    expect(outbound).toHaveLength(0)
  })

  it('is 400 no_credentials with no stored row', async () => {
    const res = await runTest()
    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('no_credentials')
  })

  it('records success on a 200, logs the event without the email, and calls FindCaseByEmail live', async () => {
    row = await storedRow()
    const res = await runTest()
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; status: number | null; tested_at: string }
    expect(body).toMatchObject({ ok: true, status: 200 })
    expect(typeof body.tested_at).toBe('string')
    expect(recordIntegrationTest).toHaveBeenCalledWith(expect.anything(), FIRM, 'logics', true)
    const event = vi.mocked(logEvent).mock.calls[0][1]
    expect(event).toMatchObject({ firm_id: FIRM, actor_type: 'staff', actor_id: ADMIN })
    expect(event.action).toBe('integration.logics.tested')
    expect(event.payload).toEqual({ ok: true, status: 200 })
    expect(JSON.stringify(event.payload)).not.toContain('@')
    // Always the live client, even with LOGICS_MODE=fake.
    expect(outbound).toHaveLength(1)
    expect(outbound[0].url).toBe(`${DEFAULT_LOGICS_BASE_URL}Find/FindCaseByEmail?email=zack%40resspark.test`)
  })

  it('records failure on a 401', async () => {
    row = await storedRow()
    logicsResponse = async () => new Response('', { status: 401 })
    const res = await runTest()
    expect(await res.json()).toMatchObject({ ok: false, status: 401 })
    expect(recordIntegrationTest).toHaveBeenCalledWith(expect.anything(), FIRM, 'logics', false)
    expect(vi.mocked(logEvent).mock.calls[0][1].payload).toEqual({ ok: false, status: 401 })
  })

  it('reports status null when the network fails twice', async () => {
    row = await storedRow()
    logicsResponse = async () => {
      throw new TypeError('network down')
    }
    const res = await runTest()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: false, status: null })
    expect(outbound).toHaveLength(2)
  })
})
