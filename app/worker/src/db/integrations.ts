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

// Saving new credentials clears the last test, so a stale success can never vouch for a new key (D-03).
export async function upsertIntegration(
  env: DbEnv,
  input: {
    firm_id: string
    provider: IntegrationProvider
    base_url: string
    api_key_ciphertext: string
    secret_ciphertext: string
    key_hint: string
    updated_by: string
  }
): Promise<FirmIntegrationRow> {
  const { data, error } = await createAdminClient(env)
    .from('firm_integrations')
    .upsert(
      { ...input, last_test_ok: null, last_test_at: null, updated_at: new Date().toISOString() },
      { onConflict: 'firm_id,provider' }
    )
    .select('*')
    .single()
  if (error) throw new Error('integration_write_failed')
  return data as FirmIntegrationRow
}

export async function recordIntegrationTest(
  env: DbEnv,
  firmId: string,
  provider: IntegrationProvider,
  ok: boolean
): Promise<void> {
  const { error } = await createAdminClient(env)
    .from('firm_integrations')
    .update({ last_test_ok: ok, last_test_at: new Date().toISOString() })
    .eq('firm_id', firmId)
    .eq('provider', provider)
  if (error) throw new Error('integration_write_failed')
}
