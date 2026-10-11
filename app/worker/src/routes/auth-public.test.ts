import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { acceptStaffInvite, openInviteForToken, passwordResetUrl, signUpFirm } from '../accounts/service'
import { sendPasswordResetEmail } from '../integrations/email/account-emails'
import { _resetRateLimitForTests } from '../middleware/link-rate-limit'
import { authPublicRoute } from './auth-public'

vi.mock('../accounts/service', () => ({
  acceptStaffInvite: vi.fn(),
  openInviteForToken: vi.fn(),
  passwordResetUrl: vi.fn(),
  signUpFirm: vi.fn(),
}))
vi.mock('../integrations/email/account-emails', () => ({ sendPasswordResetEmail: vi.fn() }))

const app = new Hono<{ Bindings: Env }>()
  .route('/api/auth', authPublicRoute)
  .onError((e, c) => c.json({ error: { code: e instanceof HTTPException ? e.message : 'internal' } }, e instanceof HTTPException ? e.status : 500))
const env = {} as Env
const post = (path: string, body: unknown, type = 'application/json') =>
  app.request(`http://w/api/auth${path}`, { method: 'POST', headers: { 'content-type': type }, body: JSON.stringify(body) }, env)
const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code
const SIGN_UP = { email: 'Dana@Firm.test', password: 'long-enough-pw', name: 'Dana Lee', firm_name: 'Lee Tax' }

beforeEach(() => {
  _resetRateLimitForTests()
  vi.mocked(signUpFirm).mockResolvedValue({ ok: true, userId: 'U1', firmId: 'F1', email: 'dana@firm.test' })
})
afterEach(() => vi.clearAllMocks())

describe('POST /api/auth/sign-up', () => {
  it('creates the firm account with normalized input', async () => {
    const res = await post('/sign-up', SIGN_UP)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, email: 'dana@firm.test' })
    expect(signUpFirm).toHaveBeenCalledWith(env, { email: 'dana@firm.test', password: 'long-enough-pw', name: 'Dana Lee', firmName: 'Lee Tax' })
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it.each([
    [{ email: 'nope' }, 'invalid_email'],
    [{ password: 'short' }, 'weak_password'],
    [{ name: ' ' }, 'invalid_name'],
    [{ firm_name: '' }, 'invalid_firm_name'],
  ])('refuses %o with %s', async (patch, expected) => {
    const res = await post('/sign-up', { ...SIGN_UP, ...patch })
    expect(res.status).toBe(400)
    expect(await code(res)).toBe(expected)
    expect(signUpFirm).not.toHaveBeenCalled()
  })

  it('answers 409 email_exists', async () => {
    vi.mocked(signUpFirm).mockResolvedValue({ ok: false, code: 'email_exists' })
    const res = await post('/sign-up', SIGN_UP)
    expect([res.status, await code(res)]).toEqual([409, 'email_exists'])
  })

  it('refuses a non-JSON post (no cross-site form posts)', async () => {
    const res = await post('/sign-up', SIGN_UP, 'text/plain')
    expect(res.status).toBe(415)
  })

  it('throttles one ip after 20 calls a minute', async () => {
    for (let i = 0; i < 20; i++) await post('/sign-up', SIGN_UP)
    expect((await post('/sign-up', SIGN_UP)).status).toBe(429)
  })
})

describe('invites', () => {
  it('describes an open invite and 404s anything else', async () => {
    vi.mocked(openInviteForToken).mockResolvedValueOnce({
      tokenHash: 'h',
      invite: { id: 'I1', firm_id: 'F1', email: 'sam@b.co', role: 'staff', expires_at: 'x', firm_name: 'Lee Tax' },
    })
    const ok = await app.request('http://w/api/auth/invite?token=t', {}, env)
    expect(await ok.json()).toEqual({ email: 'sam@b.co', role: 'staff', firm_name: 'Lee Tax', expires_at: 'x' })
    vi.mocked(openInviteForToken).mockResolvedValueOnce(null)
    const missing = await app.request('http://w/api/auth/invite?token=t', {}, env)
    expect([missing.status, await code(missing)]).toEqual([404, 'invite_invalid'])
  })

  it('accepts with name and password and returns the email to sign in with', async () => {
    vi.mocked(acceptStaffInvite).mockResolvedValue({ ok: true, userId: 'U2', firmId: 'F1', email: 'sam@b.co' })
    const res = await post('/accept-invite', { token: 't', name: 'Sam', password: 'long-enough-pw' })
    expect(await res.json()).toEqual({ ok: true, email: 'sam@b.co' })
  })

  it('maps a closed invite to 404 and a weak password to 400', async () => {
    vi.mocked(acceptStaffInvite).mockResolvedValue({ ok: false, code: 'invite_invalid' })
    expect((await post('/accept-invite', { token: 't', name: 'Sam', password: 'long-enough-pw' })).status).toBe(404)
    const weak = await post('/accept-invite', { token: 't', name: 'Sam', password: 'short' })
    expect([weak.status, await code(weak)]).toEqual([400, 'weak_password'])
  })
})

describe('POST /api/auth/forgot-password', () => {
  it('sends the reset link when the account exists', async () => {
    vi.mocked(passwordResetUrl).mockResolvedValue('http://w/admin/reset-password?token_hash=h')
    const res = await post('/forgot-password', { email: 'Dana@Firm.test' })
    expect(await res.json()).toEqual({ ok: true })
    expect(passwordResetUrl).toHaveBeenCalledWith(env, 'dana@firm.test', 'http://w')
    expect(sendPasswordResetEmail).toHaveBeenCalledWith(env, { to: 'dana@firm.test', url: 'http://w/admin/reset-password?token_hash=h' })
  })

  it('gives the same answer for an unknown email and sends nothing', async () => {
    vi.mocked(passwordResetUrl).mockResolvedValue(null)
    expect(await (await post('/forgot-password', { email: 'ghost@firm.test' })).json()).toEqual({ ok: true })
    expect(sendPasswordResetEmail).not.toHaveBeenCalled()
  })

  it('stops after 3 links per address per 15 minutes', async () => {
    vi.mocked(passwordResetUrl).mockResolvedValue('u')
    for (let i = 0; i < 4; i++) await post('/forgot-password', { email: 'dana@firm.test' })
    expect(passwordResetUrl).toHaveBeenCalledTimes(3)
  })
})
