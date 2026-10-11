import { getSignedCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { cookieSecret, uuidToBytes } from '../auth/client-link'
import { findClientLink } from '../db/client-links'

export interface ClientCtx {
  linkId: string
  requestId: string
  firmId: string
  expiresAt: string
  openedAt: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Identity comes from the signed rs_client cookie only; every failure is the same null (C2, C3).
async function resolveClient(env: Env, raw: string | false | undefined): Promise<ClientCtx | null> {
  if (!raw) return null
  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof payload !== 'object' || payload === null) return null
  const { link_id, exp } = payload as Record<string, unknown>
  if (typeof link_id !== 'string' || !UUID.test(link_id)) return null
  if (typeof exp !== 'number' || !Number.isFinite(exp) || exp <= Date.now()) return null
  const row = await findClientLink(env, uuidToBytes(link_id))
  if (!row || !row.request_id || row.revoked_at || !(Date.parse(row.expires_at) > Date.now())) return null
  return {
    linkId: row.id,
    requestId: row.request_id,
    firmId: row.firm_id,
    expiresAt: row.expires_at,
    openedAt: row.opened_at,
  }
}

export const clientSession = createMiddleware<{ Bindings: Env; Variables: { client: ClientCtx } }>(
  async (c, next) => {
    const raw = await getSignedCookie(c, await cookieSecret(c.env.CLIENT_LINK_HMAC_KEY), 'rs_client')
    const client = await resolveClient(c.env, raw)
    if (!client) throw new HTTPException(401, { message: 'no_session' })
    c.set('client', client)
    await next()
  }
)

// CSRF guard on top of SameSite=Lax: a cross-site form cannot set this header.
export const requireClientHeader = createMiddleware(async (c, next) => {
  if (c.req.header('x-requested-with') !== 'ResSpark') throw new HTTPException(403, { message: 'bad_origin' })
  await next()
})
