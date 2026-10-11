import { timingSafeEqual } from 'node:crypto'
import { decodeProtectedHeader, importJWK, jwtVerify, type JWK } from 'jose'
import type { WebhookAdapter } from './types'

// plaid.com/docs/api/webhooks/webhook-verification: Plaid-Verification is an ES256 JWT whose kid
// resolves through /webhook_verification_key/get; claims iat (<= 5 min old) and request_body_sha256.
const PLAID_HOST: Record<string, string> = {
  sandbox: 'https://sandbox.plaid.com',
  production: 'https://production.plaid.com',
}

// Module scope on purpose: isolates may recycle it, which only costs one more key fetch.
const keys = new Map<string, JsonWebKey>()

const enc = (s: string) => new TextEncoder().encode(s)
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

export function _setPlaidKeyForTests(kid: string, jwk: JsonWebKey): void {
  keys.set(kid, jwk)
}

export function _clearPlaidKeysForTests(): void {
  keys.clear()
}

// shortcut: a local key fetch; Plan 04 swaps it for plaidFetch from integrations/bank/plaid/client.ts.
async function plaidKeyFetch(env: Env, kid: string): Promise<JsonWebKey | null> {
  const host = PLAID_HOST[env.PLAID_ENV ?? 'sandbox'] ?? PLAID_HOST.sandbox
  try {
    const res = await fetch(`${host}/webhook_verification_key/get`, {
      method: 'POST',
      headers: { 'PLAID-CLIENT-ID': env.PLAID_CLIENT_ID!, 'PLAID-SECRET': env.PLAID_SECRET!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key_id: kid }),
    })
    if (!res.ok) return null
    const key = ((await res.json()) as { key?: JsonWebKey & { expired_at?: unknown } } | null)?.key
    return key && !key.expired_at ? key : null
  } catch {
    return null
  }
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

export const plaidAdapter: WebhookAdapter = {
  id: 'plaid',
  configured: (env) => Boolean(env.PLAID_CLIENT_ID && env.PLAID_SECRET),
  async verify(raw, headers, env) {
    const jwt = headers.get('plaid-verification')
    if (!jwt || !plaidAdapter.configured(env)) return null
    let kid: string | undefined
    try {
      const header = decodeProtectedHeader(jwt)
      if (header.alg !== 'ES256') return null
      kid = header.kid
    } catch {
      return null
    }
    if (!kid) return null
    let jwk = keys.get(kid)
    if (!jwk) {
      const fetched = await plaidKeyFetch(env, kid)
      if (!fetched) return null
      keys.set(kid, fetched)
      jwk = fetched
    }
    let claims: { iat?: number; request_body_sha256?: unknown }
    try {
      const key = await importJWK(jwk as JWK, 'ES256')
      ;({ payload: claims } = await jwtVerify(jwt, key, { algorithms: ['ES256'], maxTokenAge: '5 min' }))
    } catch {
      return null
    }
    const digest = hex(await crypto.subtle.digest('SHA-256', enc(raw)))
    const claimed = str(claims.request_body_sha256)
    if (claimed.length !== digest.length || !timingSafeEqual(enc(digest), enc(claimed))) return null
    try {
      const payload = JSON.parse(raw) as unknown
      if (typeof payload !== 'object' || payload === null) return null
      return { payload: payload as Record<string, unknown>, iat: claims.iat }
    } catch {
      return null
    }
  },
  // LINK webhooks (SESSION_FINISHED, EVENTS) carry a session id; item webhooks carry no event id or
  // timestamp, so the JWT iat stands in for D-02's "timestamp" [ASSUMED].
  eventKey: (v) =>
    v.payload.webhook_type === 'LINK'
      ? `${str(v.payload.link_session_id)}:${str(v.payload.webhook_code)}`
      : `${str(v.payload.item_id)}:${str(v.payload.webhook_code)}:${v.iat ?? ''}`,
}
