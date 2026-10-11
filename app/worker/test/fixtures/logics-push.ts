import { createHash, randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BUCKET } from '../../src/storage/case-documents'
import { cleanupRequest, TEST_FIRM_ID } from './request'

// Live-test fixtures for Phase 5. Each suite owns a permanent case of the test firm whose
// logics_case_id is a fake-tenant CaseID (900001, 900002): events.case_id has no ON DELETE, so a
// case with events can never be deleted. Requests, items, documents, objects and ledger rows are
// removed by cleanup().
export const PUSH_CASES = {
  900001: '00000000-0000-0000-0000-0000000000e5',
  900002: '00000000-0000-0000-0000-0000000000e6',
} as const
export const TEST_STAFF_UUID = '00000000-0000-0000-0000-0000000000a5'

export const sha256hex = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

const must = <T>(res: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (res.error || res.data === null) throw new Error(`${what}: ${res.error?.message ?? 'no data'}`)
  return res.data
}

export interface PushFixture {
  case_id: string
  request_id: string
  item_id: string
  document_ids: string[]
  cleanup(): Promise<void>
}

// One approved upload item holding one ready document per entry of `docs`.
export async function seedPushRequest(
  admin: SupabaseClient,
  opts: { logicsCaseId: keyof typeof PUSH_CASES; docs: Array<{ name: string; bytes: Uint8Array }> }
): Promise<PushFixture> {
  const caseId = PUSH_CASES[opts.logicsCaseId]
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
        { id: caseId, firm_id: TEST_FIRM_ID, first_name: 'Push', last_name: 'Probe', logics_case_id: opts.logicsCaseId },
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
        case_id: caseId,
        template_name: 'test',
        status: 'waiting_on_staff',
        agent_display_name: 'Test agent',
        sent_at: new Date().toISOString(),
      })
      .select('id')
      .single(),
    'seed request'
  ) as { id: string }
  const item = must(
    await admin
      .from('request_items')
      .insert({ request_id: request.id, position: 1, kind: 'upload', label: 'Documents', required: true, status: 'approved' })
      .select('id')
      .single(),
    'seed item'
  ) as { id: string }

  const documentIds: string[] = []
  for (const doc of opts.docs) {
    const id = randomUUID()
    const key = `firm/${TEST_FIRM_ID}/case/${caseId}/item/${item.id}/${id}/${doc.name}`
    const up = await admin.storage.from(BUCKET).upload(key, doc.bytes, { contentType: 'application/pdf' })
    if (up.error) throw new Error(`seed object: ${up.error.message}`)
    must(
      await admin
        .from('documents')
        .insert({
          id,
          case_id: caseId,
          request_item_id: item.id,
          storage_key: key,
          original_filename: doc.name,
          mime_type: 'application/pdf',
          size_bytes: doc.bytes.byteLength,
          sha256: sha256hex(doc.bytes),
          status: 'ready',
        })
        .select('id'),
      'seed document'
    )
    documentIds.push(id)
  }

  return {
    case_id: caseId,
    request_id: request.id,
    item_id: item.id,
    document_ids: documentIds,
    async cleanup() {
      must(await admin.from('logics_pushes').delete().eq('request_id', request.id).select('id'), 'delete pushes')
      must(await admin.from('logics_push_batches').delete().eq('request_id', request.id).select('id'), 'delete batches')
      await cleanupRequest(admin, { request_id: request.id })
    },
  }
}
