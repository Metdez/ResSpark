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
  settings?: Record<string, unknown> // NOT NULL in SQL (default {}); optional so row literals in tests need not set it
}

// D-08 firm configuration in firm_integrations.settings (migration 0006).
export interface LogicsSettings {
  file_category_id: number | null
  activity_type: string
  write_enabled: boolean
  activity_types_seen: string[]
}

// Defaults for a missing row or key; unknown keys are ignored.
export function readSettings(row: Pick<FirmIntegrationRow, 'settings'> | null): LogicsSettings {
  const s = row?.settings ?? {}
  const id = s.file_category_id
  const type = typeof s.activity_type === 'string' ? s.activity_type.trim() : ''
  const seen = Array.isArray(s.activity_types_seen) ? s.activity_types_seen : []
  return {
    file_category_id: Number.isInteger(id) && (id as number) >= 1 ? (id as number) : null,
    activity_type: type || 'General',
    write_enabled: s.write_enabled === true,
    activity_types_seen: seen.filter((t): t is string => typeof t === 'string'),
  }
}

// Read-then-merge-then-write (only `settings` is written): two admins racing on settings is last-writer-wins, not a safety issue.
export async function updateSettings(env: DbEnv, firmId: string, patch: Partial<LogicsSettings>): Promise<LogicsSettings> {
  const row = await getIntegration(env, firmId, 'logics')
  const settings = { ...row?.settings, ...patch }
  // Upsert: a firm in fake mode may configure settings before saving any credentials.
  const { error } = await createAdminClient(env)
    .from('firm_integrations')
    .upsert({ firm_id: firmId, provider: 'logics', settings }, { onConflict: 'firm_id,provider' })
  if (error) throw new Error('integration_write_failed')
  return readSettings({ settings })
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
