import { createAdminClient } from './client'

type DbEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>

const MINUTE = 60_000
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
const ids = (rows: unknown) => ((rows ?? []) as Array<{ id: string }>).map((r) => r.id)

// --- Cron queries (D-04, D-13) ---

// Non-terminal connections with no webhook, poll or creation in the last `olderThanMinutes`,
// younger than 14 days (Truv order expiry), least recently polled first.
export async function listStaleConnections(env: DbEnv, olderThanMinutes = 10, limit = 50): Promise<string[]> {
  const cutoff = ago(olderThanMinutes * MINUTE)
  const { data, error } = await createAdminClient(env)
    .from('connections')
    .select('id')
    .in('status', ['pending', 'connected', 'syncing'])
    .or(`last_webhook_at.is.null,last_webhook_at.lt.${cutoff}`)
    .or(`last_polled_at.is.null,last_polled_at.lt.${cutoff}`)
    .lt('created_at', cutoff)
    .gt('created_at', ago(14 * 24 * 60 * MINUTE))
    .order('last_polled_at', { ascending: true, nullsFirst: true })
    .limit(limit)
  if (error) throw new Error('connection_list_failed')
  return ids(data)
}

// Ledger rows still 'queued' after 2 minutes: a crash between insert and JOBS.send.
export async function listStuckWebhookEvents(
  env: DbEnv,
  olderThanMinutes = 2,
  limit = 50
): Promise<Array<{ id: string; provider: 'plaid' | 'truv' }>> {
  const { data, error } = await createAdminClient(env)
    .from('webhook_events')
    .select('id, provider')
    .eq('status', 'queued')
    .in('provider', ['plaid', 'truv'])
    .lt('received_at', ago(olderThanMinutes * MINUTE))
    .order('received_at', { ascending: true })
    .limit(limit)
  if (error) throw new Error('webhook_list_failed')
  return (data ?? []) as Array<{ id: string; provider: 'plaid' | 'truv' }>
}

// Pending bank connections older than `hours` that never got an access token: the Hosted Link
// session (6 h) is gone. The secret's absence is filtered here, not in SQL (no schema change).
export async function expireStalePendingBank(env: DbEnv, hours = 6): Promise<string[]> {
  const { data, error } = await createAdminClient(env)
    .from('connections')
    .select('id, connection_secrets(connection_id)')
    .eq('kind', 'bank')
    .eq('status', 'pending')
    .lt('created_at', ago(hours * 60 * MINUTE))
    .limit(100)
  if (error) throw new Error('connection_list_failed')
  const rows = (data ?? []) as Array<{ id: string; connection_secrets: unknown }>
  // one-to-one embed: PostgREST returns an object or null (an array on older schema caches)
  const hasSecret = (s: unknown) => (Array.isArray(s) ? s.length > 0 : s !== null && s !== undefined)
  return rows.filter((r) => !hasSecret(r.connection_secrets)).map((r) => r.id)
}

// BANK-06: Plaid Items past remove_after that still hold an access token, oldest first.
export async function listRemovalCandidates(env: DbEnv, limit = 20): Promise<string[]> {
  const { data, error } = await createAdminClient(env)
    .from('connections')
    .select('id, connection_secrets!inner(connection_id)')
    .eq('provider', 'plaid')
    .is('removed_at', null)
    .lte('remove_after', new Date().toISOString())
    .order('remove_after', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit)
  if (error) throw new Error('connection_list_failed')
  return ids(data)
}
