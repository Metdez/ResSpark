import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { parseEmail, parseName, parsePassword } from '../accounts/input'
import { acceptStaffInvite, openInviteForToken, passwordResetUrl, signUpFirm } from '../accounts/service'
import { sendPasswordResetEmail } from '../integrations/email/account-emails'
import { allowInWindow } from '../middleware/link-rate-limit'

// Public (no session) account endpoints: sign-up, invite lookup/accept, forgot password.
// Answers carry fixed codes only; emails and passwords are never logged.

const bad = (code: string) => new HTTPException(400, { message: code })

// Per-ip throttle shared with the client-link limiter binding under its own key prefix. A JSON
// content type is required so a cross-site form post cannot reach these without a CORS preflight.
const guard = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  c.header('Cache-Control', 'no-store')
  if (c.req.method === 'POST' && !c.req.header('content-type')?.startsWith('application/json')) {
    throw new HTTPException(415, { message: 'unsupported_media_type' })
  }
  const key = `auth:${c.req.header('cf-connecting-ip') ?? 'unknown'}`
  const binding = c.env.LINK_RATE_LIMITER as Env['LINK_RATE_LIMITER'] | undefined
  const limited = binding?.limit ? !(await binding.limit({ key })).success : !allowInWindow(key, 20, 60_000)
  if (limited) throw new HTTPException(429, { message: 'rate_limited' })
  await next()
})

const body = async (c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> => {
  const v: unknown = await c.req.json().catch(() => null)
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw bad('bad_request')
  return v as Record<string, unknown>
}

const refused = (code: string) => {
  const status = code === 'invite_invalid' ? 404 : code === 'weak_password' ? 400 : 409
  return new HTTPException(status, { message: code })
}

export const authPublicRoute = new Hono<{ Bindings: Env }>()
  .use('*', guard)
  .post('/sign-up', async (c) => {
    const b = await body(c)
    const email = parseEmail(b.email)
    const password = parsePassword(b.password)
    const name = parseName(b.name)
    const firmName = parseName(b.firm_name, 120)
    if (!email) throw bad('invalid_email')
    if (!password) throw bad('weak_password')
    if (!name) throw bad('invalid_name')
    if (!firmName) throw bad('invalid_firm_name')
    const result = await signUpFirm(c.env, { email, password, name, firmName })
    if (!result.ok) throw refused(result.code)
    return c.json({ ok: true, email: result.email })
  })
  .get('/invite', async (c) => {
    const open = await openInviteForToken(c.env, c.req.query('token'))
    if (!open) throw new HTTPException(404, { message: 'invite_invalid' })
    const { email, role, firm_name, expires_at } = open.invite
    return c.json({ email, role, firm_name, expires_at })
  })
  .post('/accept-invite', async (c) => {
    const b = await body(c)
    const password = parsePassword(b.password)
    const name = parseName(b.name)
    if (!password) throw bad('weak_password')
    if (!name) throw bad('invalid_name')
    const result = await acceptStaffInvite(c.env, { token: b.token, name, password })
    if (!result.ok) throw refused(result.code)
    return c.json({ ok: true, email: result.email })
  })
  .post('/forgot-password', async (c) => {
    const email = parseEmail((await body(c)).email)
    if (!email) throw bad('invalid_email')
    // Same answer whether or not the account exists (no enumeration); 3 sends per address per 15 min.
    if (allowInWindow(`forgot:${email}`, 3, 15 * 60_000)) {
      const url = await passwordResetUrl(c.env, email, new URL(c.req.url).origin)
      if (url) await sendPasswordResetEmail(c.env, { to: email, url })
    }
    return c.json({ ok: true })
  })
