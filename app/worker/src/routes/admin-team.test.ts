import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authUserInfo } from '../accounts/auth-users'
import { inviteStaff, passwordResetUrl } from '../accounts/service'
import { getFirmName, listFirmProfiles, listOpenInvites, revokeInvite } from '../db/accounts'
import { logEvent } from '../db/events'
import { sendInviteEmail } from '../integrations/email/account-emails'
import { adminTeamRoute } from './admin-team'

const staff = { userId: 'U1', firmId: 'F1', role: 'admin', displayName: 'Dana Admin', email: 'dana@firm.test' }
vi.mock('../middleware/staff-auth', async () => {
  const { createMiddleware } = await import('hono/factory')
  return {
    staffAuth: createMiddleware(async (c, next) => {
      c.set('staff', { ...staff })
      await next()
    }),
  }
})
vi.mock('../db/events', () => ({ logEvent: vi.fn() }))
vi.mock('../db/accounts', () => ({
  getFirmName: vi.fn(),
  listFirmProfiles: vi.fn(),
  listOpenInvites: vi.fn(),
  revokeInvite: vi.fn(),
}))
vi.mock('../accounts/auth-users', () => ({ authUserInfo: vi.fn() }))
vi.mock('../accounts/service', () => ({ inviteStaff: vi.fn(), passwordResetUrl: vi.fn() }))
vi.mock('../integrations/email/account-emails', () => ({ sendInviteEmail: vi.fn() }))

const app = new Hono<{ Bindings: Env }>()
  .route('/api/admin/team', adminTeamRoute)
  .onError((e, c) => c.json({ error: { code: e instanceof HTTPException ? e.message : 'internal' } }, e instanceof HTTPException ? e.status : 500))
const env = {} as Env
const req = (method: string, path: string, body?: unknown) =>
  app.request(
    `http://w/api/admin/team${path}`,
    body === undefined ? { method } : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
    env
  )
const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code
const MEMBER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

beforeEach(() => {
  staff.role = 'admin'
  vi.mocked(listFirmProfiles).mockResolvedValue([
    { user_id: 'U1', display_name: 'Dana Admin', role: 'admin', created_at: 't0' },
    { user_id: MEMBER, display_name: 'Sam', role: 'staff', created_at: 't1' },
  ])
  vi.mocked(authUserInfo).mockResolvedValue(
    new Map([
      ['U1', { email: 'dana@firm.test', last_sign_in_at: 't2' }],
      [MEMBER, { email: 'sam@firm.test', last_sign_in_at: null }],
    ])
  )
  vi.mocked(listOpenInvites).mockResolvedValue([{ id: 'I1', email: 'new@firm.test', role: 'staff', created_at: 't', expires_at: 'e' }])
  vi.mocked(getFirmName).mockResolvedValue('Lee Tax')
  vi.mocked(inviteStaff).mockResolvedValue({ id: 'I2', expires_at: 'e', url: 'http://w/admin/join?token=t' })
  vi.mocked(sendInviteEmail).mockResolvedValue({ ok: false, reason: 'not_configured' })
})
afterEach(() => vi.clearAllMocks())

describe('GET /api/admin/team', () => {
  it('lists members with emails, and open invites for an admin', async () => {
    const body = (await (await req('GET', '')).json()) as Record<string, unknown>
    expect(body.members).toEqual([
      { user_id: 'U1', display_name: 'Dana Admin', role: 'admin', created_at: 't0', email: 'dana@firm.test', last_sign_in_at: 't2' },
      { user_id: MEMBER, display_name: 'Sam', role: 'staff', created_at: 't1', email: 'sam@firm.test', last_sign_in_at: null },
    ])
    expect(body.invites).toHaveLength(1)
    expect(body).toMatchObject({ can_manage: true, you: 'U1' })
    expect(listFirmProfiles).toHaveBeenCalledWith(env, 'F1')
  })

  it('hides invites from staff', async () => {
    staff.role = 'staff'
    const body = (await (await req('GET', '')).json()) as Record<string, unknown>
    expect(body).toMatchObject({ invites: [], can_manage: false })
    expect(listOpenInvites).not.toHaveBeenCalled()
  })
})

describe('POST /api/admin/team/invites', () => {
  it('invites into the caller firm and returns the link with the email status', async () => {
    const res = await req('POST', '/invites', { email: 'New@Firm.test', role: 'staff' })
    expect(await res.json()).toEqual({
      id: 'I2',
      email: 'new@firm.test',
      role: 'staff',
      expires_at: 'e',
      url: 'http://w/admin/join?token=t',
      email_status: 'not_configured',
    })
    expect(inviteStaff).toHaveBeenCalledWith(env, { firmId: 'F1', email: 'new@firm.test', role: 'staff', invitedBy: 'U1', origin: 'http://w' })
    expect(sendInviteEmail).toHaveBeenCalledWith(env, expect.objectContaining({ to: 'new@firm.test', firmName: 'Lee Tax', inviterName: 'Dana Admin' }))
  })

  it('is admin-only', async () => {
    staff.role = 'staff'
    expect((await req('POST', '/invites', { email: 'x@firm.test', role: 'staff' })).status).toBe(403)
    expect(inviteStaff).not.toHaveBeenCalled()
  })

  it('refuses a bad email, a bad role and an existing member', async () => {
    expect(await code(await req('POST', '/invites', { email: 'x', role: 'staff' }))).toBe('invalid_email')
    expect((await req('POST', '/invites', { email: 'x@firm.test', role: 'owner' })).status).toBe(400)
    const dup = await req('POST', '/invites', { email: 'SAM@firm.test', role: 'staff' })
    expect([dup.status, await code(dup)]).toEqual([409, 'already_member'])
  })
})

describe('invite revoke and reset links', () => {
  it('revokes an open invite of the firm and logs it', async () => {
    vi.mocked(revokeInvite).mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    expect((await req('DELETE', `/invites/${MEMBER}`)).status).toBe(200)
    expect(revokeInvite).toHaveBeenCalledWith(env, 'F1', MEMBER)
    expect(logEvent).toHaveBeenCalledWith(env, expect.objectContaining({ action: 'staff.invite_revoked', firm_id: 'F1' }))
    expect((await req('DELETE', `/invites/${MEMBER}`)).status).toBe(404)
    expect((await req('DELETE', '/invites/not-a-uuid')).status).toBe(400)
  })

  it('makes a reset link only for a member of the same firm', async () => {
    vi.mocked(passwordResetUrl).mockResolvedValue('http://w/admin/reset-password?token_hash=h')
    const res = await req('POST', `/members/${MEMBER}/reset-link`)
    expect(await res.json()).toEqual({ url: 'http://w/admin/reset-password?token_hash=h' })
    expect(passwordResetUrl).toHaveBeenCalledWith(env, 'sam@firm.test', 'http://w')
    const other = await req('POST', '/members/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/reset-link')
    expect(other.status).toBe(404)
  })
})
