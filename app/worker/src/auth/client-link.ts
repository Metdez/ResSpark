import { findClientLink } from '../db/client-links'

export interface ClientLinkRow {
  id: string
  firm_id: string
  request_id: string | null
  version: number
  expires_at: string
  revoked_at: string | null
  opened_at: string | null
}

type LinkEnv = Pick<Env, 'CLIENT_LINK_HMAC_KEY' | 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>
type FindLink = (env: LinkEnv, linkId: Uint8Array) => Promise<ClientLinkRow | null>

const utf8 = new TextEncoder()
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{64}$/

function concat(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}

function be32(n: number): Uint8Array {
  const out = new Uint8Array(4)
  new DataView(out.buffer).setUint32(0, n)
  return out
}

export function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', utf8.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ])
}

// Hono signs rs_client with this, so the cookie MAC key never equals the link MAC key.
export async function cookieSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', utf8.encode(secret + ':cookie'))
  return Buffer.from(digest).toString('hex')
}

export function uuidToBytes(id: string): Uint8Array {
  return new Uint8Array(Buffer.from(id.replace(/-/g, ''), 'hex'))
}

export function bytesToUuid(b: Uint8Array): string {
  const h = Buffer.from(b).toString('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export async function mintLinkToken(key: CryptoKey, linkId: Uint8Array, version: number): Promise<string> {
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, concat(linkId, be32(version))))
  return Buffer.from(concat(linkId, mac)).toString('base64url')
}

// Every failure returns null so the route cannot tell malformed, unknown, revoked and expired apart.
export async function verifyLinkToken(
  env: LinkEnv,
  token: string,
  find: FindLink = findClientLink
): Promise<ClientLinkRow | null> {
  try {
    if (!TOKEN_SHAPE.test(token)) return null
    const raw = new Uint8Array(Buffer.from(token, 'base64url'))
    if (raw.length !== 48) return null
    const linkId = raw.slice(0, 16)
    const mac = raw.slice(16)
    const row = await find(env, linkId)
    if (!row) return null
    const key = await hmacKey(env.CLIENT_LINK_HMAC_KEY)
    // constant-time comparison inside WebCrypto
    const valid = await crypto.subtle.verify('HMAC', key, mac, concat(linkId, be32(row.version)))
    if (!valid || row.revoked_at || !(Date.parse(row.expires_at) > Date.now())) return null
    return row
  } catch {
    return null
  }
}
