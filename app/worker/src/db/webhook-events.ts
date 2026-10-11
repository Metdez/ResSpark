import { createAdminClient } from './client'

type DbEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>

export type WebhookProvider = 'plaid' | 'truv' | 'docuseal'

export interface WebhookEventRow {
  id: string
  provider: WebhookProvider
  event_key: string
  payload: Record<string, unknown>
  status: 'queued' | 'processing' | 'done' | 'ignored' | 'dead'
  attempts: number
  last_error: string | null
  received_at: string
}

// D-01: insert once per (provider, event_key). A duplicate inserts nothing and returns null.
export async function recordWebhook(
  env: DbEnv,
  provider: WebhookProvider,
  eventKey: string,
  payload: Record<string, unknown>
): Promise<string | null> {
  const { data, error } = await createAdminClient(env)
    .from('webhook_events')
    .upsert({ provider, event_key: eventKey, payload, status: 'queued' }, { onConflict: 'provider,event_key', ignoreDuplicates: true })
    .select('id')
    .maybeSingle()
  if (error) throw new Error('webhook_record_failed')
  return (data as { id: string } | null)?.id ?? null
}

export async function getWebhookEvent(env: DbEnv, id: string): Promise<WebhookEventRow | null> {
  const { data, error } = await createAdminClient(env)
    .from('webhook_events')
    .select('id, provider, event_key, payload, status, attempts, last_error, received_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error('webhook_lookup_failed')
  return (data as WebhookEventRow | null) ?? null
}

export async function markWebhookEvent(
  env: DbEnv,
  id: string,
  status: WebhookEventRow['status'],
  lastError: string | null = null
): Promise<void> {
  const admin = createAdminClient(env)
  const patch: Record<string, unknown> = { status, last_error: lastError }
  if (status === 'processing') {
    // shortcut: read-then-write increment; a lost increment only skews the counter, move it into an RPC if it ever gates logic
    const { data } = await admin.from('webhook_events').select('attempts').eq('id', id).maybeSingle()
    patch.attempts = ((data as { attempts: number } | null)?.attempts ?? 0) + 1
  } else if (status !== 'queued') {
    patch.processed_at = new Date().toISOString()
  }
  const { error } = await admin.from('webhook_events').update(patch).eq('id', id)
  if (error) throw new Error('webhook_mark_failed')
}

let firmOverride: string | null = null

// Lets live tests keep their webhook.rejected events under the test firm.
export function _setDefaultFirmIdForTests(id: string | null): void {
  firmOverride = id
}

// shortcut: events are firm-scoped and an unverifiable webhook has no firm; v1 is single-firm, so the
// first firm owns it. Upgrade by giving each firm its own webhook path when multi-firm lands.
export async function defaultFirmId(env: DbEnv): Promise<string> {
  if (firmOverride) return firmOverride
  const { data, error } = await createAdminClient(env).from('firms').select('id').order('id').limit(1).maybeSingle()
  if (error || !data) throw new Error('firm_lookup_failed')
  return (data as { id: string }).id
}
