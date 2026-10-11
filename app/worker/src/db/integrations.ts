import { createAdminClient } from './client'

type DbEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>
export type IntegrationProvider = 'logics'

export interface FirmIntegrationRow {
  id: string
  firm_id: string
  provider: IntegrationProvider
  base_url: string
  api_key_ciphertext: string | null
  secret_ciphertext: string | null
  key_hint: string | null
  last_test_at: string | null
  last_test_ok: boolean | null
  updated_by: string | null
  updated_at: string
}

export async function getIntegration(
  env: DbEnv,
  firmId: string,
  provider: IntegrationProvider
): Promise<FirmIntegrationRow | null> {
  const { data, error } = await createAdminClient(env)
    .from('firm_integrations')
    .select('*')
    .eq('firm_id', firmId)
    .eq('provider', provider)
    .maybeSingle()
  if (error) throw new Error('integration_read_failed')
  return data as FirmIntegrationRow | null
}
