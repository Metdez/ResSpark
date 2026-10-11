export interface StaffProfile {
  user_id: string
  firm_id: string
  role: 'staff' | 'admin'
  display_name: string
}

export async function getStaffProfile(
  _env: Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>,
  _userId: string
): Promise<StaffProfile | null> {
  throw new Error('not implemented')
}
