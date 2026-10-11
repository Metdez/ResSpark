import { Hono, type Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { authUserInfo } from '../accounts/auth-users'
import { parseEmail, parseRole } from '../accounts/input'
import { inviteStaff, passwordResetUrl } from '../accounts/service'
import { getFirmName, listFirmProfiles, listOpenInvites, revokeInvite } from '../db/accounts'
import { logEvent } from '../db/events'
import { sendInviteEmail } from '../integrations/email/account-emails'
import { staffAuth, type StaffCtx } from '../middleware/staff-auth'

type TeamApp = { Bindings: Env; Variables: { staff: StaffCtx } }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Every write is admin-only and scoped to the caller's firm from the verified JWT (staffAuth).
const requireAdmin = (c: Context<TeamApp>) => {
  if (c.var.staff.role !== 'admin') throw new HTTPException(403, { message: 'forbidden' })
}
const uuidParam = (c: Context<TeamApp>, name: string) => {
  const v = c.req.param(name)
  if (!v || !UUID.test(v)) throw new HTTPException(400, { message: 'bad_request' })
  return v
}
const staffEvent = (c: Context<TeamApp>, action: string, payload: Record<string, unknown>) =>
  logEvent(c.env, { firm_id: c.var.staff.firmId, actor_type: 'staff', actor_id: c.var.staff.userId, action, payload })

async function members(c: Context<TeamApp>) {
  const profiles = await listFirmProfiles(c.env, c.var.staff.firmId)
  const info = await authUserInfo(c.env, profiles.map((p) => p.user_id))
  return profiles.map((p) => ({ ...p, ...(info.get(p.user_id) ?? { email: null, last_sign_in_at: null }) }))
}

export const adminTeamRoute = new Hono<TeamApp>()
  .use('*', staffAuth)
  .get('/', async (c) => {
    const isAdmin = c.var.staff.role === 'admin'
    const [list, invites] = await Promise.all([members(c), isAdmin ? listOpenInvites(c.env, c.var.staff.firmId) : []])
    return c.json({ members: list, invites, can_manage: isAdmin, you: c.var.staff.userId })
  })
  .post('/invites', async (c) => {
    requireAdmin(c)
    const b: unknown = await c.req.json().catch(() => null)
    const fields = typeof b === 'object' && b !== null ? (b as Record<string, unknown>) : {}
    const email = parseEmail(fields.email)
    const role = parseRole(fields.role)
    if (!email) throw new HTTPException(400, { message: 'invalid_email' })
    if (!role) throw new HTTPException(400, { message: 'bad_request' })
    if ((await members(c)).some((m) => m.email?.toLowerCase() === email)) {
      throw new HTTPException(409, { message: 'already_member' })
    }
    const origin = new URL(c.req.url).origin
    const invite = await inviteStaff(c.env, { firmId: c.var.staff.firmId, email, role, invitedBy: c.var.staff.userId, origin })
    const sent = await sendInviteEmail(c.env, {
      to: email,
      firmName: await getFirmName(c.env, c.var.staff.firmId),
      inviterName: c.var.staff.displayName,
      url: invite.url,
      expiresAt: invite.expires_at,
    })
    const email_status = sent.ok ? 'sent' : sent.reason
    // The admin gets the link too, so an invite still works before email delivery is set up.
    return c.json({ id: invite.id, email, role, expires_at: invite.expires_at, url: invite.url, email_status })
  })
  .delete('/invites/:id', async (c) => {
    requireAdmin(c)
    const id = uuidParam(c, 'id')
    if (!(await revokeInvite(c.env, c.var.staff.firmId, id))) throw new HTTPException(404, { message: 'not_found' })
    await staffEvent(c, 'staff.invite_revoked', { invite_id: id })
    return c.json({ ok: true })
  })
  .post('/members/:userId/reset-link', async (c) => {
    requireAdmin(c)
    const userId = uuidParam(c, 'userId')
    const member = (await members(c)).find((m) => m.user_id === userId)
    if (!member?.email) throw new HTTPException(404, { message: 'not_found' })
    const url = await passwordResetUrl(c.env, member.email, new URL(c.req.url).origin)
    if (!url) throw new HTTPException(404, { message: 'not_found' })
    await staffEvent(c, 'staff.reset_link_created', { user_id: userId })
    return c.json({ url })
  })
