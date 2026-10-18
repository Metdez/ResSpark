import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from 'jose'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { confirmLogicsCase, getCase } from '../src/db/cases'
import { getIntegration, type FirmIntegrationRow } from '../src/db/integrations'
import { getStaffProfile } from '../src/db/staff'
import { app } from '../src/index'
import { encryptSecret } from '../src/integrations/credential-crypto'
import { DEFAULT_LOGICS_BASE_URL } from '../src/integrations/logics/config'

vi.mock('../src/db/staff', () => ({ getStaffProfile: vi.fn() }))
vi.mock('../src/db/events', () => ({ logEvent: vi.fn() }))
vi.mock('../src/db/integrations', () => ({ getIntegration: vi.fn() }))
vi.mock('../src/db/cases', () => ({ confirmLogicsCase: vi.fn(), getCase: vi.fn() }))
vi.mock('../src/db/dashboard', () => ({ listCaseRequests: vi.fn().mockResolvedValue([]) }))

const FIRM = '00000000-0000-0000-0000-000000000001'
const SUB = '11111111-2222-4333-8444-555555555555'
const CASE_UUID = '22222222-3333-4444-8555-666666666666'
const SUPA = 'https://lookup.supabase.test'
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
let logicsResponse: () => Promise<Response>

// Staff fabrication lifted from auth.test.ts: a locally signed JWT checked against a stubbed JWKS.
async function token(): Promise<string> {
  return new SignJWT({ email: 'zack@resspark.test', role: 'authenticated', app_metadata: { firm_id: FIRM } })
    .setProtectedHeader({ alg: 'ES256', kid: 'k' })
    .setSubject(SUB)
    .setIssuer(`${SUPA}/auth/v1`)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(signingKey)
}

const call = async (
  method: string,
  path: string,
  body?: unknown,
  opts: { auth?: boolean; mode?: string } = {}
) => {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.auth !== false) headers.authorization = `Bearer ${await token()}`
  const init = { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }
  return app.request(path, init, env(opts.mode))
}
const lookup = (body: unknown, opts?: { auth?: boolean; mode?: string }) =>
  call('POST', '/api/admin/lookup', body, opts)
const errorCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code

beforeAll(async () => {
  const pair = await generateKeyPair('ES256')
  signingKey = pair.privateKey
  jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k', alg: 'ES256' }] }
})

let logLines: string[] = []
beforeEach(() => {
  logLines = []
  vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
    logLines.push(String(line))
  })
  logicsResponse = async () => new Response(JSON.stringify({ Success: true, data: [] }))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.startsWith(SUPA)) return new Response(JSON.stringify(jwks))
      return logicsResponse()
    })
  )
  vi.mocked(getStaffProfile).mockResolvedValue({ user_id: SUB, firm_id: FIRM, role: 'admin', display_name: 'Zack' })
  vi.mocked(getIntegration).mockResolvedValue(null)
  vi.mocked(confirmLogicsCase).mockResolvedValue(CASE_UUID)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.mocked(getIntegration).mockReset()
  vi.mocked(confirmLogicsCase).mockReset()
  vi.mocked(getCase).mockReset()
})

async function testedRow(): Promise<FirmIntegrationRow> {
  return {
    id: 'row',
    firm_id: FIRM,
    provider: 'logics',
    base_url: DEFAULT_LOGICS_BASE_URL,
    api_key_ciphertext: await encryptSecret(KEY, 'api-key'),
    secret_ciphertext: await encryptSecret(KEY, 'secret'),
    key_hint: '-key',
    last_test_at: '2026-10-11T00:00:00Z',
    last_test_ok: true,
    updated_by: SUB,
    updated_at: '2026-10-11T00:00:00Z',
  }
}

type Results = { results: Record<string, unknown>[]; mode: string }

describe('POST /api/admin/lookup (fixture mode)', () => {
  it('is 401 unauthorized without a token', async () => {
    const res = await lookup({ type: 'phone', value: '(555) 010-0001' }, { auth: false })
    expect(res.status).toBe(401)
    expect(await errorCode(res)).toBe('unauthorized')
  })

  it('returns both cards for the shared fixture phone, labeled fake, with no DOB', async () => {
    const res = await lookup({ type: 'phone', value: '(555) 010-0001' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Results
    expect(body.mode).toBe('fake')
    expect(body.results).toHaveLength(2)
    for (const r of body.results) {
      expect(r).toHaveProperty('logics_case_id')
      expect(r).toHaveProperty('first_name')
      expect(r).toHaveProperty('matched_field')
      expect(Object.keys(r)).not.toContain('DOB')
    }
  })

  it('narrows by last name with a digits-only phone', async () => {
    const res = await lookup({ type: 'phone', value: '5550100001', last_name: 'Rivera' })
    expect(((await res.json()) as Results).results).toHaveLength(2)
  })

  it('finds one case by email', async () => {
    const res = await lookup({ type: 'email', value: 'morgan.lee@example.com' })
    expect(((await res.json()) as Results).results).toHaveLength(1)
  })

  it('finds one case by case id', async () => {
    const res = await lookup({ type: 'case_id', value: '900004' })
    const body = (await res.json()) as Results
    expect(body.results).toHaveLength(1)
    expect(body.results[0].logics_case_id).toBe(900004)
  })

  it('returns an empty list, not an error, for an unknown case id', async () => {
    const res = await lookup({ type: 'case_id', value: '123' })
    expect(res.status).toBe(200)
    expect(((await res.json()) as Results).results).toEqual([])
  })

  it.each([
    ['a whitespace value', { type: 'phone', value: '   ' }],
    ['a type outside the enum', { type: 'ssn', value: 'x' }],
    ['a missing value', { type: 'email' }],
    ['a non-string last_name', { type: 'phone', value: '5550100001', last_name: 7 }],
    ['no body', undefined],
  ])('is 400 bad_request for %s', async (_name, body) => {
    const res = await lookup(body)
    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('bad_request')
    expect(getIntegration).not.toHaveBeenCalled()
  })

  it('is 400 phone_invalid for a short phone, and the log lines hold no search value', async () => {
    const res = await lookup({ type: 'phone', value: '555010' })
    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('phone_invalid')
    const bad = await lookup({ type: 'ssn', value: 'x' })
    expect(bad.status).toBe(400)
    expect(logLines).toHaveLength(2)
    expect(logLines.join('\n')).not.toContain('555010')
    expect(logLines.join('\n')).not.toContain('ssn')
  })

  it('is 400 email_invalid for a malformed email', async () => {
    const res = await lookup({ type: 'email', value: 'not-an-email' })
    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('email_invalid')
  })
})

describe('POST /api/admin/lookup (live mode)', () => {
  it('is 409 logics_not_configured with no stored credentials', async () => {
    const res = await lookup({ type: 'phone', value: '5550100001' }, { mode: 'live' })
    expect(res.status).toBe(409)
    expect(await errorCode(res)).toBe('logics_not_configured')
  })

  it('is 502 logics_unauthorized when Logics answers 401', async () => {
    vi.mocked(getIntegration).mockResolvedValue(await testedRow())
    logicsResponse = async () => new Response('', { status: 401 })
    const res = await lookup({ type: 'email', value: 'a@example.com' }, { mode: 'live' })
    expect(res.status).toBe(502)
    expect(await errorCode(res)).toBe('logics_unauthorized')
  })

  it('is 502 logics_forbidden when the key lacks a scope (Logics answers 403)', async () => {
    vi.mocked(getIntegration).mockResolvedValue(await testedRow())
    logicsResponse = async () => new Response('{"Message":"Access denied. Missing required scope: case.read"}', { status: 403 })
    const res = await lookup({ type: 'email', value: 'a@example.com' }, { mode: 'live' })
    expect(res.status).toBe(502)
    expect(await errorCode(res)).toBe('logics_forbidden')
  })

  it('is 502 logics_unreachable when the network fails twice', async () => {
    vi.mocked(getIntegration).mockResolvedValue(await testedRow())
    logicsResponse = async () => {
      throw new TypeError('network down')
    }
    const res = await lookup({ type: 'email', value: 'a@example.com' }, { mode: 'live' })
    expect(res.status).toBe(502)
    expect(await errorCode(res)).toBe('logics_unreachable')
  })

  it('treats Success:false as no results and labels the mode live', async () => {
    vi.mocked(getIntegration).mockResolvedValue(await testedRow())
    logicsResponse = async () => new Response(JSON.stringify({ Success: false, data: null }))
    const res = await lookup({ type: 'email', value: 'a@example.com' }, { mode: 'live' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ results: [], mode: 'live' })
  })
})

describe('POST /api/admin/cases/:logicsCaseId/confirm', () => {
  it('uses only the fresh CaseInfo read and search_type, never other body fields', async () => {
    const res = await call('POST', '/api/admin/cases/900001/confirm', {
      search_type: 'phone',
      first_name: 'Hacker',
      case_id: 'other',
    })
    expect(res.status).toBe(200)
    const input = vi.mocked(confirmLogicsCase).mock.calls[0][1]
    expect(input.summary.first_name).toBe('Jordan')
    expect(input.phone_e164).toBe('+15550100001')
    expect(input.search_type).toBe('phone')
    expect(input.firm_id).toBe(FIRM)
    expect(input.actor_id).toBe(SUB)
    expect(Object.keys(input.summary)).not.toContain('DOB')
    expect(await res.json()).toEqual({
      case_id: CASE_UUID,
      logics_case_id: 900001,
      first_name: 'Jordan',
      last_name: 'Rivera',
      email: 'jordan.rivera@example.com',
      phone_e164: '+15550100001',
    })
  })

  it('is 404 case_not_found when Logics has no such case, and writes nothing', async () => {
    const res = await call('POST', '/api/admin/cases/1/confirm', { search_type: 'case_id' })
    expect(res.status).toBe(404)
    expect(await errorCode(res)).toBe('case_not_found')
    expect(confirmLogicsCase).not.toHaveBeenCalled()
  })

  it('is 400 bad_request for a non-numeric case id', async () => {
    const res = await call('POST', '/api/admin/cases/abc/confirm', { search_type: 'phone' })
    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('bad_request')
  })

  it('is 400 bad_request without a valid search_type', async () => {
    const res = await call('POST', '/api/admin/cases/900001/confirm', { search_type: 'dob' })
    expect(res.status).toBe(400)
    expect(confirmLogicsCase).not.toHaveBeenCalled()
  })

  it('is 409 logics_not_configured in live mode with no credentials', async () => {
    const res = await call('POST', '/api/admin/cases/900001/confirm', { search_type: 'phone' }, { mode: 'live' })
    expect(res.status).toBe(409)
    expect(await errorCode(res)).toBe('logics_not_configured')
  })
})

describe('GET /api/admin/cases/:id', () => {
  it('returns the case fields and an empty requests list, without the snapshot', async () => {
    vi.mocked(getCase).mockResolvedValue({
      id: CASE_UUID,
      firm_id: FIRM,
      logics_case_id: 900001,
      first_name: 'Jordan',
      last_name: 'Rivera',
      email: 'jordan.rivera@example.com',
      phone_e164: '+15550100001',
      logics_snapshot: { logics_case_id: 900001 },
      logics_fetched_at: '2026-10-11T00:00:00Z',
    })
    const res = await call('GET', `/api/admin/cases/${CASE_UUID}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      case_id: CASE_UUID,
      logics_case_id: 900001,
      first_name: 'Jordan',
      last_name: 'Rivera',
      email: 'jordan.rivera@example.com',
      phone_e164: '+15550100001',
      logics_fetched_at: '2026-10-11T00:00:00Z',
      requests: [],
    })
    expect(getCase).toHaveBeenCalledWith(expect.anything(), FIRM, CASE_UUID)
  })

  it('is 404 not_found when the case is not in the staff firm', async () => {
    vi.mocked(getCase).mockResolvedValue(null)
    const res = await call('GET', `/api/admin/cases/${CASE_UUID}`)
    expect(res.status).toBe(404)
    expect(await errorCode(res)).toBe('not_found')
  })

  it('is 400 bad_request for a non-uuid id', async () => {
    const res = await call('GET', '/api/admin/cases/123')
    expect(res.status).toBe(400)
    expect(getCase).not.toHaveBeenCalled()
  })
})
