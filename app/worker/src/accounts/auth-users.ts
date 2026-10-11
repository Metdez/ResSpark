import { createAdminClient } from '../db/client'

// Thin wrappers over the Supabase Auth admin API (service key, server side only).
// Authorization data goes in app_metadata only, never user_metadata (user-editable).

type AuthEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>

export type CreateUserResult = { ok: true; id: string } | { ok: false; reason: 'email_exists' | 'weak_password' | 'failed' }

// email_confirm: true because the Worker vouches for the address. shortcut: public sign-up does not
// verify email ownership yet; add a confirmation email once RESEND_API_KEY is set for every deploy.
export async function createAuthUser(
  env: AuthEnv,
  input: { email: string; password: string; appMetadata?: Record<string, string> }
): Promise<CreateUserResult> {
  const { data, error } = await createAdminClient(env).auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    app_metadata: input.appMetadata,
  })
  if (!error && data.user) return { ok: true, id: data.user.id }
  if (error?.code === 'email_exists' || error?.code === 'user_already_exists') return { ok: false, reason: 'email_exists' }
  if (error?.code === 'weak_password') return { ok: false, reason: 'weak_password' }
  return { ok: false, reason: 'failed' }
}

export async function setAppMetadata(env: AuthEnv, userId: string, appMetadata: Record<string, string>): Promise<void> {
  const { error } = await createAdminClient(env).auth.admin.updateUserById(userId, { app_metadata: appMetadata })
  if (error) throw new Error('app_metadata_failed')
}

// Compensation step when a later write fails; staff_profiles rows go with the user (ON DELETE CASCADE).
export async function deleteAuthUser(env: AuthEnv, userId: string): Promise<void> {
  await createAdminClient(env).auth.admin.deleteUser(userId)
}

// One-time recovery token for /admin/reset-password, or null when no account has this email.
// generateLink sends no email itself; the caller delivers the link.
export async function recoveryTokenHash(env: AuthEnv, email: string): Promise<string | null> {
  const { data, error } = await createAdminClient(env).auth.admin.generateLink({ type: 'recovery', email })
  if (error || !data.properties?.hashed_token) return null
  return data.properties.hashed_token
}

export interface AuthUserInfo {
  email: string | null
  last_sign_in_at: string | null
}

// shortcut: one admin call per member; fine for firm-sized teams, batch through SQL past ~100 staff.
export async function authUserInfo(env: AuthEnv, ids: string[]): Promise<Map<string, AuthUserInfo>> {
  const admin = createAdminClient(env)
  const rows = await Promise.all(
    ids.map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id)
      return [id, { email: data.user?.email ?? null, last_sign_in_at: data.user?.last_sign_in_at ?? null }] as const
    })
  )
  return new Map(rows)
}
