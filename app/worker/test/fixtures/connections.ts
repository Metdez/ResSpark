import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '../../src/db/client'

// Live-test fixtures for Phase 4. Everything is written under the permanent test firm and case;
// cleanup() removes what the test created. events are append-only and stay (test firm only).
export const TEST_FIRM_ID = '00000000-0000-0000-0000-00000000000e'
export const TEST_CASE_ID = '00000000-0000-0000-0000-0000000000e1'
// Every fixture webhook_id starts with this, so cleanup can find leftovers of a crashed run.
export const FIXTURE_KEY_PREFIX = 'wh_fixture_'

export interface ConnectionFixture {
  firm_id: string
  case_id: string
  request_id: string
  item_id: string
  link_id: string
  admin: SupabaseClient
  cleanup(): Promise<void>
}

// Raw fixture text, read once: tests sign exactly these bytes.
export const fixtureText = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`./${rel}`, import.meta.url).href), 'utf8')

const must = <T>(res: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (res.error || res.data === null) throw new Error(`${what}: ${res.error?.message ?? 'no data'}`)
  return res.data
}

export async function deleteFixtureWebhooks(admin: SupabaseClient): Promise<void> {
  must(await admin.from('webhook_events').delete().like('event_key', `${FIXTURE_KEY_PREFIX}%`).select('id'), 'delete webhooks')
}

// One opened request with one required connect item and a live client link.
export async function seedConnectionFixture(
  env: Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>,
  opts: { kind: 'payroll' | 'bank' }
): Promise<ConnectionFixture> {
  const admin = createAdminClient(env)
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
  const now = new Date().toISOString()
  const request = must(
    await admin
      .from('requests')
      .insert({ firm_id: TEST_FIRM_ID, case_id: TEST_CASE_ID, template_name: 'test', status: 'opened', sent_at: now, opened_at: now })
      .select('id')
      .single(),
    'seed request'
  ) as { id: string }
  const item = must(
    await admin
      .from('request_items')
      .insert({
        request_id: request.id,
        position: 1,
        kind: opts.kind === 'payroll' ? 'payroll_connect' : 'bank_connect',
        label: opts.kind === 'payroll' ? 'Connect your payroll' : 'Connect your bank',
        required: true,
        status: 'pending',
      })
      .select('id')
      .single(),
    'seed item'
  ) as { id: string }
  const link = must(
    await admin
      .from('client_links')
      .insert({ firm_id: TEST_FIRM_ID, request_id: request.id, expires_at: new Date(Date.now() + 14 * 86_400_000).toISOString() })
      .select('id')
      .single(),
    'seed link'
  ) as { id: string }

  return {
    firm_id: TEST_FIRM_ID,
    case_id: TEST_CASE_ID,
    request_id: request.id,
    item_id: item.id,
    link_id: link.id,
    admin,
    // webhook_events are not request-scoped; the suite that posts them calls deleteFixtureWebhooks.
    async cleanup() {
      must(await admin.from('connections').delete().eq('request_id', request.id).select('id'), 'delete connections')
      // Cascades request_items, client_links, client_sessions and consents.
      must(await admin.from('requests').delete().eq('id', request.id).select('id'), 'delete request')
    },
  }
}
