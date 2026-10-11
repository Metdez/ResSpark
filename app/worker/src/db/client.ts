import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Created per request, never at module scope: the secret key must not outlive the request's env.
export function createAdminClient(
  env: Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>
): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY")
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
