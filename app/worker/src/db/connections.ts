import { createAdminClient } from './client'

type DbEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>

export type ProviderId = 'plaid' | 'truv' | 'teller'
export type ConnectionKind = 'bank' | 'payroll'
export type ConnectionStatus = 'pending' | 'connected' | 'syncing' | 'done' | 'error' | 'removed'

export interface ConnectionRow {
  id: string
  firm_id: string
  request_id: string
  request_item_id: string
  case_id: string
  provider: ProviderId
  kind: ConnectionKind
  external_id: string | null
  link_ref: string | null
  return_nonce: string | null
  status: ConnectionStatus
  data: Record<string, unknown>
  error: Record<string, unknown> | null
  sync_cursor: string | null
  last_webhook_at: string | null
  last_polled_at: string | null
  connected_at: string | null
  completed_at: string | null
  remove_after: string | null
  removed_at: string | null
  created_at: string
}

export interface SetStatusResult {
  applied: boolean
  status: ConnectionStatus
  item_status: string | null
  request_status: string | null
}

export interface SealedSecret {
  ciphertext: string
  iv: string
  key_version: number
}

const COLUMNS =
  'id, firm_id, request_id, request_item_id, case_id, provider, kind, external_id, link_ref, return_nonce, status, data, error, sync_cursor, last_webhook_at, last_polled_at, connected_at, completed_at, remove_after, removed_at, created_at'

// RAISE tokens of connection_set_status / connection_record_event (migration 0005).
const TOKENS = ['connection_not_found', 'bad_status'] as const
const tokenOf = (error: { message?: string }, fallback: string) =>
  TOKENS.find((t) => (error.message ?? '').split(/\W+/).includes(t)) ?? fallback

export async function insertConnection(
  env: DbEnv,
  input: Pick<ConnectionRow, 'firm_id' | 'request_id' | 'request_item_id' | 'case_id' | 'provider' | 'kind'> &
    Partial<Pick<ConnectionRow, 'external_id' | 'link_ref' | 'return_nonce' | 'data'>>
): Promise<ConnectionRow> {
  const { data, error } = await createAdminClient(env).from('connections').insert(input).select(COLUMNS).single()
  if (error || !data) throw new Error('connection_insert_failed')
  return data as ConnectionRow
}

async function findOne(env: DbEnv, column: string, value: string, provider?: ProviderId): Promise<ConnectionRow | null> {
  let q = createAdminClient(env).from('connections').select(COLUMNS).eq(column, value)
  if (provider) q = q.eq('provider', provider)
  const { data, error } = await q.order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw new Error('connection_lookup_failed')
  return (data as ConnectionRow | null) ?? null
}

export const getConnection = (env: DbEnv, id: string) => findOne(env, 'id', id)

export const findConnectionByExternalId = (env: DbEnv, provider: ProviderId, externalId: string) =>
  findOne(env, 'external_id', externalId, provider)

export const findConnectionByLinkRef = (env: DbEnv, linkRef: string) => findOne(env, 'link_ref', linkRef)

// Truv task webhooks carry a link_id that lives inside data.employers[] (jsonb containment).
export async function findConnectionByEmployerLink(env: DbEnv, linkId: string): Promise<ConnectionRow | null> {
  const { data, error } = await createAdminClient(env)
    .from('connections')
    .select(COLUMNS)
    .eq('provider', 'truv')
    .contains('data', { employers: [{ link_id: linkId }] })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error('connection_lookup_failed')
  return (data as ConnectionRow | null) ?? null
}

export async function latestConnectionForItem(env: DbEnv, requestItemId: string): Promise<ConnectionRow | null> {
  const { data, error } = await createAdminClient(env)
    .from('connections')
    .select(COLUMNS)
    .eq('request_item_id', requestItemId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error('connection_lookup_failed')
  return (data as ConnectionRow | null) ?? null
}

export async function listNonTerminalConnections(env: DbEnv, kind: ConnectionKind, limit: number): Promise<ConnectionRow[]> {
  const { data, error } = await createAdminClient(env)
    .from('connections')
    .select(COLUMNS)
    .eq('kind', kind)
    .in('status', ['pending', 'connected', 'syncing'])
    .order('last_polled_at', { ascending: true, nullsFirst: true })
    .limit(limit)
  if (error) throw new Error('connection_list_failed')
  return (data ?? []) as ConnectionRow[]
}

// Never writes status: connection_set_status is the only status writer (D-03).
export async function updateConnection(
  env: DbEnv,
  id: string,
  patch: Partial<
    Pick<
      ConnectionRow,
      'external_id' | 'link_ref' | 'return_nonce' | 'data' | 'sync_cursor' | 'last_webhook_at' | 'last_polled_at' | 'remove_after'
    >
  >
): Promise<void> {
  const { error } = await createAdminClient(env).from('connections').update(patch).eq('id', id)
  if (error) throw new Error('connection_update_failed')
}

export async function setConnectionStatus(
  env: DbEnv,
  id: string,
  status: ConnectionStatus,
  detail: Record<string, unknown> = {},
  actorId?: string
): Promise<SetStatusResult> {
  const { data, error } = await createAdminClient(env).rpc('connection_set_status', {
    p_connection_id: id,
    p_new_status: status,
    p_detail: detail,
    p_actor_id: actorId ?? null,
  })
  if (error) throw new Error(tokenOf(error, 'status_failed'))
  return data as SetStatusResult
}

export async function recordConnectionEvent(
  env: DbEnv,
  id: string,
  action: string,
  payload: Record<string, unknown> = {},
  actor: { type: 'provider' | 'system' | 'client' | 'staff'; id?: string } = { type: 'provider' }
): Promise<void> {
  const { error } = await createAdminClient(env).rpc('connection_record_event', {
    p_connection_id: id,
    p_action: action,
    p_payload: payload,
    p_actor_type: actor.type,
    p_actor_id: actor.id ?? null,
  })
  if (error) throw new Error(tokenOf(error, 'event_failed'))
}

export async function saveSecret(env: DbEnv, connectionId: string, sealed: SealedSecret): Promise<void> {
  const { error } = await createAdminClient(env)
    .from('connection_secrets')
    .upsert({ connection_id: connectionId, ...sealed }, { onConflict: 'connection_id' })
  if (error) throw new Error('secret_save_failed')
}

export async function getSecret(env: DbEnv, connectionId: string): Promise<SealedSecret | null> {
  const { data, error } = await createAdminClient(env)
    .from('connection_secrets')
    .select('ciphertext, iv, key_version')
    .eq('connection_id', connectionId)
    .maybeSingle()
  if (error) throw new Error('secret_lookup_failed')
  return (data as SealedSecret | null) ?? null
}

export async function deleteSecret(env: DbEnv, connectionId: string): Promise<void> {
  const { error } = await createAdminClient(env).from('connection_secrets').delete().eq('connection_id', connectionId)
  if (error) throw new Error('secret_delete_failed')
}
