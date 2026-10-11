import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

// T-03-07 / Phase 1 F-6 through the API: the publishable key (PostgREST role anon) can neither read
// request_dashboard_v nor call any 0004 function. Run with `pnpm -C app run test:live:file worker/test/phase3-anon.test.ts`.
// Zero uuids mean no row could match even if a call were allowed, so a refusal proves the grant, not the data.
const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const ZERO = '00000000-0000-0000-0000-000000000000'

describe.skipIf(!url || !key)('0004 view and functions are not reachable with the publishable key', () => {
  const anon = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } })

  // Same strict bar as rls.test.ts: 401 + 42501 (grant revoked), never a 200 with data.
  const refused = (res: { data: unknown; error: { code?: string } | null; status: number }) => {
    expect(res.data).toBeNull()
    expect({ status: res.status, code: res.error?.code }).toEqual({ status: 401, code: '42501' })
  }

  it('request_dashboard_v', async () => {
    refused(await anon.from('request_dashboard_v').select('*').limit(1))
  })

  it('request_status', async () => {
    refused(await anon.rpc('request_status', { p_request_id: ZERO }))
  })

  it('request_apply_status', async () => {
    refused(await anon.rpc('request_apply_status', { p_request_id: ZERO }))
  })

  it('upload_complete', async () => {
    refused(
      await anon.rpc('upload_complete', {
        p_document_id: ZERO,
        p_request_id: ZERO,
        p_size_bytes: 1,
        p_sha256: 'a'.repeat(64),
        p_actor_id: 'x',
      })
    )
  })

  it('item_approve', async () => {
    refused(await anon.rpc('item_approve', { p_item_id: ZERO, p_firm_id: ZERO, p_actor_id: 'x' }))
  })

  it('item_reject', async () => {
    refused(await anon.rpc('item_reject', { p_item_id: ZERO, p_firm_id: ZERO, p_note: 'n', p_actor_id: 'x' }))
  })
})
