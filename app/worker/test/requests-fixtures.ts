import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from 'jose'
import { vi } from 'vitest'
import type { ClientLinkRow } from '../src/auth/client-link'
import type { CaseRow } from '../src/db/cases'
import type { LinkRow, RequestBundle, RequestRow } from '../src/db/requests'
import { app } from '../src/index'

export const FIRM = '00000000-0000-0000-0000-000000000001'
export const SUB = '11111111-2222-4333-8444-555555555555'
export const CASE = '22222222-3333-4444-8555-666666666666'
export const REQ = '33333333-4444-4555-8666-777777777777'
export const LINK = '44444444-5555-4666-8777-888888888888'
export const SUPA = 'https://requests.supabase.test'
export const ORIGIN = 'http://localhost/c/'
const FUTURE = '2099-01-01T00:00:00.000Z'

export const env = (over: Record<string, unknown> = {}) =>
  ({
    SUPABASE_URL: SUPA,
    SUPABASE_SECRET_KEY: 'unit',
    LOGICS_MODE: 'fake',
    INTEGRATION_ENC_KEY: '00'.repeat(32),
    APP_ENV: 'sandbox',
    CLIENT_LINK_HMAC_KEY: 'test-key',
    ...over,
  }) as unknown as Env

let signingKey: CryptoKey
let jwks: unknown

export async function initKeys(): Promise<void> {
  const pair = await generateKeyPair('ES256')
  signingKey = pair.privateKey
  jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k', alg: 'ES256' }] }
}

// Staff fabrication as in admin-lookup.test.ts: a locally signed JWT checked against a stubbed JWKS.
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

type Outbound = (url: string, init?: RequestInit) => Promise<Response>

// JWKS requests are answered here; every other outbound call goes to `other` (default: 500).
export function stubFetch(other: Outbound = async () => new Response('{}', { status: 500 })) {
  const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url.startsWith(SUPA)) return new Response(JSON.stringify(jwks))
    return other(url, init)
  })
  vi.stubGlobal('fetch', f)
  return f
}

export const outboundCalls = (f: ReturnType<typeof stubFetch>) =>
  f.mock.calls.filter(([input]) => !String(input instanceof Request ? input.url : input).startsWith(SUPA))

export async function call(
  method: string,
  path: string,
  body?: unknown,
  opts: { auth?: boolean; env?: Record<string, unknown> } = {}
): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.auth !== false) headers.authorization = `Bearer ${await token()}`
  const init = { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }
  return app.request(path, init, env(opts.env))
}

export const errorCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code

export const caseRow = (over: Partial<CaseRow> = {}): CaseRow => ({
  id: CASE,
  firm_id: FIRM,
  logics_case_id: 900001,
  first_name: 'Jordan',
  last_name: 'Rivera',
  email: 'jordan.rivera@example.com',
  phone_e164: '+15550100001',
  logics_snapshot: null,
  logics_fetched_at: '2026-10-11T00:00:00Z',
  ...over,
})

export const linkRow = (over: Partial<LinkRow> = {}): LinkRow => ({
  id: LINK,
  version: 1,
  expires_at: FUTURE,
  revoked_at: null,
  opened_at: null,
  ...over,
})

// The full client_links row verifyLinkToken expects from its finder.
export const clientLinkRow = (version: number): ClientLinkRow => ({
  id: LINK,
  firm_id: FIRM,
  request_id: REQ,
  version,
  expires_at: FUTURE,
  revoked_at: null,
  opened_at: null,
})

export function bundle(
  over: { request?: Partial<RequestRow>; case?: CaseRow | null; link?: LinkRow | null } = {}
): RequestBundle {
  return {
    request: {
      id: REQ,
      firm_id: FIRM,
      case_id: CASE,
      template_name: 'Standard resolution packet',
      status: 'draft',
      contact_email: null,
      contact_phone_e164: null,
      sent_at: null,
      opened_at: null,
      created_at: '2026-10-11T00:00:00Z',
      agent_display_name: 'Zack',
      ...over.request,
    },
    case: over.case === undefined ? caseRow() : over.case,
    items: [],
    link: over.link === undefined ? null : over.link,
    firm_name: 'ValorTax',
  }
}

// A request already sent to the 900001 fixture contact, with a live link.
export const sentBundle = (link: LinkRow | null = linkRow()) =>
  bundle({
    request: {
      status: 'sent',
      contact_email: 'jordan.rivera@example.com',
      contact_phone_e164: '+15550100001',
      sent_at: '2026-10-11T00:00:00Z',
    },
    link,
  })
