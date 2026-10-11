import type { SupabaseClient } from '@supabase/supabase-js'
import { BUCKET } from '../../src/storage/case-documents'

export const TEST_FIRM_ID = '00000000-0000-0000-0000-00000000000e'
// Permanent: events.case_id has no ON DELETE, so a case with events can never be deleted.
export const TEST_CASE_ID = '00000000-0000-0000-0000-0000000000e1'

export interface SeedItem {
  kind: string
  label: string
  required: boolean
  status?: string
}

export interface Seeded {
  firm_id: string
  case_id: string
  request_id: string
  item_ids: string[]
  link_id: string | null
  link_version: number | null
}

export function liveEnvOrSkip(): { url: string; secret: string; hmac: string } | null {
  const { SUPABASE_URL: url, SUPABASE_SECRET_KEY: secret, CLIENT_LINK_HMAC_KEY: hmac } = process.env
  if (url && secret && hmac) return { url, secret, hmac }
  const missing = Object.entries({ SUPABASE_URL: url, SUPABASE_SECRET_KEY: secret, CLIENT_LINK_HMAC_KEY: hmac })
    .filter(([, v]) => !v)
    .map(([k]) => k)
  process.stderr.write(`live suite skipped: missing ${missing.join(', ')}\n`)
  return null
}

const must = <T>(res: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (res.error || res.data === null) throw new Error(`${what}: ${res.error?.message ?? 'no data'}`)
  return res.data
}

export async function seedRequest(
  admin: SupabaseClient,
  opts: { items: SeedItem[]; status?: 'draft' | 'sent' | 'opened'; withLink?: boolean }
): Promise<Seeded> {
  const status = opts.status ?? 'opened'
  const now = new Date().toISOString()
  must(
    await admin
      .from('firms')
      .upsert({ id: TEST_FIRM_ID, name: 'Test firm (automated)' }, { onConflict: 'id', ignoreDuplicates: true })
      .select('id'),
    'seed firm'
  )
  must(
    await admin
      .from('cases')
      .upsert(
        { id: TEST_CASE_ID, firm_id: TEST_FIRM_ID, first_name: 'Upload', last_name: 'Probe' },
        { onConflict: 'id', ignoreDuplicates: true }
      )
      .select('id'),
    'seed case'
  )
  const request = must(
    await admin
      .from('requests')
      .insert({
        firm_id: TEST_FIRM_ID,
        case_id: TEST_CASE_ID,
        template_name: 'test',
        status,
        sent_at: status === 'draft' ? null : now,
        opened_at: status === 'opened' ? now : null,
      })
      .select('id')
      .single(),
    'seed request'
  ) as { id: string }
  const seeded: Seeded = {
    firm_id: TEST_FIRM_ID,
    case_id: TEST_CASE_ID,
    request_id: request.id,
    item_ids: [],
    link_id: null,
    link_version: null,
  }
  if (opts.items.length) {
    const rows = opts.items.map((it, i) => ({ request_id: request.id, position: i + 1, status: 'pending', ...it }))
    const items = must(await admin.from('request_items').insert(rows).select('id, position'), 'seed items') as {
      id: string
      position: number
    }[]
    seeded.item_ids = items.sort((a, b) => a.position - b.position).map((r) => r.id)
  }
  if (opts.withLink) {
    // Same row createClientLink writes (14-day expiry); inserted directly so the fixture needs no Worker env.
    const link = must(
      await admin
        .from('client_links')
        .insert({ firm_id: TEST_FIRM_ID, request_id: request.id, expires_at: new Date(Date.now() + 14 * 86_400_000).toISOString() })
        .select('id, version')
        .single(),
      'seed link'
    ) as { id: string; version: number }
    seeded.link_id = link.id
    seeded.link_version = link.version
  }
  return seeded
}

// Scoped to this request's items, not the shared case, so parallel live suites never delete each other's rows.
// The case, the firm and the append-only events stay.
export async function cleanupRequest(admin: SupabaseClient, seeded: Pick<Seeded, 'request_id'>): Promise<void> {
  const items = must(await admin.from('request_items').select('id').eq('request_id', seeded.request_id), 'cleanup items')
  const itemIds = (items as { id: string }[]).map((r) => r.id)
  if (itemIds.length) {
    const docs = must(
      await admin.from('documents').select('storage_key').in('request_item_id', itemIds),
      'cleanup documents'
    ) as { storage_key: string }[]
    if (docs.length) await admin.storage.from(BUCKET).remove(docs.map((d) => d.storage_key))
    must(await admin.from('documents').delete().in('request_item_id', itemIds).select('id'), 'delete documents')
  }
  // Cascades request_items, client_links and client_sessions.
  must(await admin.from('requests').delete().eq('id', seeded.request_id).select('id'), 'delete request')
}
