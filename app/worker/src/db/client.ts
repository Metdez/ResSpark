import type { SupabaseClient } from '@supabase/supabase-js'

export function createAdminClient(_env: Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>): SupabaseClient {
  throw new Error('not implemented')
}
