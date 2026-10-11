import { acceptInvite, createFirmWithAdmin, createInvite, findOpenInvite, type OpenInvite } from '../db/accounts'
import { createAuthUser, deleteAuthUser, recoveryTokenHash, setAppMetadata } from './auth-users'
import { hashInviteToken, INVITE_TOKEN_SHAPE, newInviteToken } from './input'

// Account flows. Each creates the auth user first (the Auth admin API is outside any SQL
// transaction), then writes the firm/profile in one RPC, and deletes the user if a later step fails.

type AccountEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>

export const INVITE_TTL_DAYS = 7

export type AccountResult = { ok: true; userId: string; firmId: string; email: string } | { ok: false; code: 'email_exists' | 'weak_password' | 'invite_invalid' }

export async function signUpFirm(
  env: AccountEnv,
  input: { email: string; password: string; name: string; firmName: string }
): Promise<AccountResult> {
  const user = await createAuthUser(env, { email: input.email, password: input.password })
  if (!user.ok) {
    if (user.reason === 'failed') throw new Error('auth_create_failed')
    return { ok: false, code: user.reason }
  }
  try {
    const firmId = await createFirmWithAdmin(env, user.id, input.firmName, input.name)
    // staffAuth requires app_metadata.firm_id to match the profile, so the claim is set last.
    await setAppMetadata(env, user.id, { firm_id: firmId, role: 'admin' })
    return { ok: true, userId: user.id, firmId, email: input.email }
  } catch (error) {
    // shortcut: a firm row created before a failed app_metadata write stays behind (its events row pins it).
    await deleteAuthUser(env, user.id)
    throw error
  }
}

// null for a malformed, unknown, used, revoked or expired token: the caller cannot tell them apart.
export async function openInviteForToken(env: AccountEnv, token: unknown): Promise<{ invite: OpenInvite; tokenHash: string } | null> {
  if (typeof token !== 'string' || !INVITE_TOKEN_SHAPE.test(token)) return null
  const tokenHash = await hashInviteToken(token)
  const invite = await findOpenInvite(env, tokenHash)
  return invite ? { invite, tokenHash } : null
}

export async function acceptStaffInvite(
  env: AccountEnv,
  input: { token: unknown; name: string; password: string }
): Promise<AccountResult> {
  const open = await openInviteForToken(env, input.token)
  if (!open) return { ok: false, code: 'invite_invalid' }
  const { invite, tokenHash } = open
  const user = await createAuthUser(env, {
    email: invite.email,
    password: input.password,
    appMetadata: { firm_id: invite.firm_id, role: invite.role },
  })
  if (!user.ok) {
    if (user.reason === 'failed') throw new Error('auth_create_failed')
    return { ok: false, code: user.reason }
  }
  try {
    await acceptInvite(env, tokenHash, user.id, input.name)
    return { ok: true, userId: user.id, firmId: invite.firm_id, email: invite.email }
  } catch (error) {
    await deleteAuthUser(env, user.id)
    if (error instanceof Error && error.message === 'invite_invalid') return { ok: false, code: 'invite_invalid' }
    throw error
  }
}

export async function inviteStaff(
  env: AccountEnv,
  input: { firmId: string; email: string; role: 'staff' | 'admin'; invitedBy: string; origin: string }
): Promise<{ id: string; expires_at: string; url: string }> {
  const token = newInviteToken()
  const row = await createInvite(env, {
    firmId: input.firmId,
    email: input.email,
    role: input.role,
    tokenHash: await hashInviteToken(token),
    invitedBy: input.invitedBy,
    ttlDays: INVITE_TTL_DAYS,
  })
  return { ...row, url: `${input.origin}/admin/join?token=${token}` }
}

// The recovery link lands on the SPA, which calls verifyOtp({ token_hash, type: 'recovery' }).
export async function passwordResetUrl(env: AccountEnv, email: string, origin: string): Promise<string | null> {
  const tokenHash = await recoveryTokenHash(env, email)
  return tokenHash ? `${origin}/admin/reset-password?token_hash=${encodeURIComponent(tokenHash)}` : null
}
