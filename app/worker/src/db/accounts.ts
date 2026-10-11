import { createAdminClient } from './client'

type DbEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>

export interface OpenInvite {
  id: string
  firm_id: string
  email: string
  role: 'staff' | 'admin'
  expires_at: string
  firm_name: string
}

export interface InviteListRow {
  id: string
  email: string
  role: 'staff' | 'admin'
  created_at: string
  expires_at: string
}

export interface ProfileRow {
  user_id: string
  display_name: string
  role: 'staff' | 'admin'
  created_at: string
}

// Postgres message text never leaves these functions; callers see fixed codes only.
const fail = (code: string): never => {
  throw new Error(code)
}

export async function createFirmWithAdmin(env: DbEnv, userId: string, firmName: string, displayName: string): Promise<string> {
  const { data, error } = await createAdminClient(env).rpc('firm_create_with_admin', {
    p_user_id: userId,
    p_firm_name: firmName,
    p_display_name: displayName,
  })
  if (error || typeof data !== 'string') return fail('firm_create_failed')
  return data
}

export async function createInvite(
  env: DbEnv,
  input: { firmId: string; email: string; role: string; tokenHash: string; invitedBy: string; ttlDays: number }
): Promise<{ id: string; expires_at: string }> {
  const { data, error } = await createAdminClient(env).rpc('staff_invite_create', {
    p_firm_id: input.firmId,
    p_email: input.email,
    p_role: input.role,
    p_token_hash: input.tokenHash,
    p_invited_by: input.invitedBy,
    p_ttl_days: input.ttlDays,
  })
  const row = Array.isArray(data) ? (data[0] as { id: string; expires_at: string } | undefined) : undefined
  if (error || !row) return fail('invite_create_failed')
  return row
}

// Open = not accepted, not revoked, not expired.
export async function findOpenInvite(env: DbEnv, tokenHash: string): Promise<OpenInvite | null> {
  const { data, error } = await createAdminClient(env)
    .from('staff_invites')
    .select('id, firm_id, email, role, expires_at, firms(name)')
    .eq('token_hash', tokenHash)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (error) return fail('invite_lookup_failed')
  if (!data) return null
  const { firms, ...row } = data as unknown as Omit<OpenInvite, 'firm_name'> & { firms: { name: string } | null }
  return { ...row, firm_name: firms?.name ?? 'your firm' }
}

// Throws 'invite_invalid' when the invite stopped being open between lookup and accept.
export async function acceptInvite(env: DbEnv, tokenHash: string, userId: string, displayName: string): Promise<void> {
  const { error } = await createAdminClient(env).rpc('staff_invite_accept', {
    p_token_hash: tokenHash,
    p_user_id: userId,
    p_display_name: displayName,
  })
  if (error) fail(error.message.includes('invite_invalid') ? 'invite_invalid' : 'invite_accept_failed')
}

export async function listOpenInvites(env: DbEnv, firmId: string): Promise<InviteListRow[]> {
  const { data, error } = await createAdminClient(env)
    .from('staff_invites')
    .select('id, email, role, created_at, expires_at')
    .eq('firm_id', firmId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
  if (error) return fail('invite_list_failed')
  return (data ?? []) as InviteListRow[]
}

// Returns false when nothing open matched (unknown id, other firm, already used or revoked).
export async function revokeInvite(env: DbEnv, firmId: string, inviteId: string): Promise<boolean> {
  const { data, error } = await createAdminClient(env)
    .from('staff_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', inviteId)
    .eq('firm_id', firmId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .select('id')
  if (error) return fail('invite_revoke_failed')
  return (data ?? []).length > 0
}

export async function listFirmProfiles(env: DbEnv, firmId: string): Promise<ProfileRow[]> {
  const { data, error } = await createAdminClient(env)
    .from('staff_profiles')
    .select('user_id, display_name, role, created_at')
    .eq('firm_id', firmId)
    .order('created_at')
  if (error) return fail('team_list_failed')
  return (data ?? []) as ProfileRow[]
}

export async function getFirmName(env: DbEnv, firmId: string): Promise<string> {
  const { data, error } = await createAdminClient(env).from('firms').select('name').eq('id', firmId).maybeSingle()
  if (error || !data) return fail('firm_lookup_failed')
  return (data as { name: string }).name
}
