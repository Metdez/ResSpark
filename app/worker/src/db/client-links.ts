import { bytesToUuid, type ClientLinkRow } from '../auth/client-link'
import { createAdminClient } from './client'

type DbEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>
const COLUMNS = 'id, firm_id, request_id, version, expires_at, revoked_at, opened_at'
const DAY_MS = 86_400_000

export async function findClientLink(env: DbEnv, linkId: Uint8Array): Promise<ClientLinkRow | null> {
  const { data, error } = await createAdminClient(env)
    .from('client_links')
    .select(COLUMNS)
    .eq('id', bytesToUuid(linkId))
    .maybeSingle()
  if (error) throw new Error('client_link_lookup_failed')
  return data ?? null
}

// request_id is required since migration 0003 (NOT NULL + FK to requests).
export async function createClientLink(
  env: DbEnv,
  input: { firm_id: string; request_id: string; created_by?: string | null; expires_in_days?: number }
): Promise<ClientLinkRow> {
  const { data, error } = await createAdminClient(env)
    .from('client_links')
    .insert({
      firm_id: input.firm_id,
      request_id: input.request_id,
      created_by: input.created_by ?? null,
      expires_at: new Date(Date.now() + (input.expires_in_days ?? 14) * DAY_MS).toISOString(),
    })
    .select(COLUMNS)
    .single()
  if (error) throw new Error('client_link_insert_failed')
  return data
}
