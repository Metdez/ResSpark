import type { ConsentKind } from '../../../src/lib/consent-text'
import { createAdminClient } from './client'

type DbEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>

export async function hasConsent(env: DbEnv, linkId: string, kind: ConsentKind, version: string): Promise<boolean> {
  const { data, error } = await createAdminClient(env)
    .from('consents')
    .select('id')
    .eq('link_id', linkId)
    .eq('kind', kind)
    .eq('text_version', version)
    .maybeSingle()
  if (error) throw new Error('consent_lookup_failed')
  return data !== null
}

// Idempotent on (link_id, kind, text_version): a repeat returns created: false and writes nothing.
export async function recordConsent(
  env: DbEnv,
  input: {
    firm_id: string
    link_id: string
    request_id: string
    kind: ConsentKind
    text_version: string
    ip_class: 'ipv4' | 'ipv6' | 'unknown'
    user_agent_class: 'phone' | 'tablet' | 'desktop' | null
  }
): Promise<{ created: boolean }> {
  const { data, error } = await createAdminClient(env)
    .from('consents')
    .upsert(input, { onConflict: 'link_id,kind,text_version', ignoreDuplicates: true })
    .select('id')
    .maybeSingle()
  if (error) throw new Error('consent_insert_failed')
  return { created: Boolean(data) }
}
