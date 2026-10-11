import { Hono } from 'hono'
import { setSignedCookie } from 'hono/cookie'
import { cookieSecret, verifyLinkToken } from '../auth/client-link'
import { linkRateLimit } from '../middleware/link-rate-limit'
import { INVALID_LINK_HTML } from './client-link-pages'

// GET /c/:token: the link is the credential (D-17/D-18). Exchange it for a signed HttpOnly
// cookie and redirect to a token-free URL; never mark the link opened here.
export const clientLinkRoute = new Hono<{ Bindings: Env }>().get('/:token', linkRateLimit, async (c) => {
  const row = await verifyLinkToken(c.env, c.req.param('token'))
  if (!row) return c.html(INVALID_LINK_HTML, 404)
  await setSignedCookie(
    c,
    'rs_client',
    JSON.stringify({ link_id: row.id, exp: Date.now() + 86_400_000 }),
    await cookieSecret(c.env.CLIENT_LINK_HMAC_KEY),
    { path: '/', httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 86_400 }
  )
  return c.redirect('/c/', 302)
})
