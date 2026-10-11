import { createAdminClient } from './client'

export interface StaffProfile {
  user_id: string
  firm_id: string
  role: 'staff' | 'admin'
  display_name: string
}

export async function getStaffProfile(
  env: Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>,
  userId: string
): Promise<StaffProfile | null> {
  const { data, error } = await createAdminClient(env)
    .from('staff_profiles')
    .select('user_id, firm_id, role, display_name')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error('staff_lookup_failed')
  return data ?? null
}
