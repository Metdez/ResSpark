import { randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAdminClient } from '../src/db/client'
import {
  claimPush,
  createBatch,
  finalizeBatch,
  fingerprintHex,
  recordBatchActivity,
  resolvePush,
  transitionPush,
  type PushState,
} from '../src/db/logics-pushes'
import { seedPushRequest, TEST_STAFF_UUID, type PushFixture } from './fixtures/logics-push'
import { TEST_FIRM_ID } from './fixtures/request'

// The ledger state machine of migration 0006 against the live project (PUSH-01 concurrency,
// PUSH-03 finalize-once, PUSH-04 transitions). Run with
// `pnpm -C app run test:live:file worker/test/logics-rpc.test.ts`.
const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env
const pdf = (fill: number) => {
  const bytes = new Uint8Array(512).fill(fill)
  bytes.set([0x25, 0x50, 0x44, 0x46, 0x2d])
  return bytes
}

describe.skipIf(!SUPABASE_URL || !SUPABASE_SECRET_KEY)('logics push ledger RPCs (live; needs SUPABASE_URL, SUPABASE_SECRET_KEY)', () => {
  const env = { SUPABASE_URL, SUPABASE_SECRET_KEY } as unknown as Env
  let db: SupabaseClient
  let fx: PushFixture
  let docA = '', docB = '', docC = '', docD = ''
  let batch1 = '', id1 = '', id2 = '', scratch = ''

  const item = async (documentId: string) => {
    const { data } = await db.from('documents').select('sha256, original_filename').eq('id', documentId).single()
    return { documentId, fingerprint: await fingerprintHex(fx.case_id, data!.sha256, 0), fileName: data!.original_filename }
  }
  const batch = async (ids: string[], pushAgain: string[] = []) =>
    createBatch(env, {
      firmId: TEST_FIRM_ID,
      requestId: fx.request_id,
      actorId: TEST_STAFF_UUID,
      agentDisplayName: 'Test agent',
      mode: 'fake',
      fileCategoryId: null,
      activityType: 'General',
      items: await Promise.all(ids.map(item)),
      pushAgain,
    })
  const row = async (id: string) => (await db.from('logics_pushes').select('*').eq('id', id).single()).data!
  // A row in any state, straight into the scratch batch: the RPC under test is what moves it.
  const insertRow = async (state: PushState, extra: Record<string, unknown> = {}) => {
    const { data, error } = await db
      .from('logics_pushes')
      .insert({
        batch_id: scratch,
        firm_id: TEST_FIRM_ID,
        case_id: fx.case_id,
        request_id: fx.request_id,
        document_id: docA,
        file_name: 'scratch.pdf',
        state,
        mode: 'fake',
        request_fingerprint: randomBytes(32).toString('hex'),
        created_by: TEST_STAFF_UUID,
        ...extra,
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return data.id as string
  }
  const move = (pushId: string, from: PushState, to: PushState, extra: Partial<Parameters<typeof transitionPush>[1]> = {}) =>
    transitionPush(env, { pushId, from, to, ...extra })

  beforeAll(async () => {
    db = createAdminClient(env)
    fx = await seedPushRequest(db, {
      logicsCaseId: 900002,
      docs: [
        { name: 'a.pdf', bytes: pdf(0x41) },
        { name: 'b.pdf', bytes: pdf(0x42) },
        { name: 'c-same-as-a.pdf', bytes: pdf(0x41) },
        { name: 'd.pdf', bytes: pdf(0x44) },
      ],
    })
    ;[docA, docB, docC, docD] = fx.document_ids
    const { data, error } = await db
      .from('logics_push_batches')
      .insert({
        firm_id: TEST_FIRM_ID,
        case_id: fx.case_id,
        request_id: fx.request_id,
        logics_case_id: 900002,
        created_by: TEST_STAFF_UUID,
        agent_display_name: 'Test agent',
        mode: 'fake',
        activity_state: 'skipped',
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    scratch = data.id
  })

  afterAll(async () => {
    if (fx) await fx.cleanup()
  })

  it('(a) equal bytes share a fingerprint: refused in one batch, with push_again too (index)', async () => {
    await expect(batch([docA, docB, docC])).rejects.toThrow('already_pushed')
    await expect(batch([docA, docB, docC], [docC])).rejects.toThrow('already_pushed')
    // nothing of the refused batches survived (all or nothing)
    expect((await db.from('logics_pushes').select('id').eq('request_id', fx.request_id)).data).toHaveLength(0)
    const created = await batch([docA, docB])
    batch1 = created.batchId
    ;[id1, id2] = created.pushIds
    expect(created.pushIds).toHaveLength(2)
  })

  it('(b) two concurrent claims of one push: exactly one row, one null, attempts 1', async () => {
    const results = await Promise.all([claimPush(env, id1), claimPush(env, id1)])
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(results.filter((r) => r === null)).toHaveLength(1)
    expect(await row(id1)).toMatchObject({ state: 'sending', attempts: 1 })
  })

  it('(c) with a sibling of the case sending, a claim is refused and the row stays queued', async () => {
    expect(await claimPush(env, id2)).toBeNull()
    expect(await row(id2)).toMatchObject({ state: 'queued', attempts: 0 })
  })

  it('(d) the transition table: refused pairs write nothing, allowed pairs move the row', async () => {
    expect(await move(id2, 'queued', 'sent', { logicsDocumentId: 1 })).toBe(false)
    expect(await move(id2, 'queued', 'failed')).toBe(false)
    expect(await row(id2)).toMatchObject({ state: 'queued', logics_document_id: null })
    await expect(move(id1, 'sending', 'sent')).rejects.toThrow('logics_pushes_sent_has_id')
    expect(await move(id1, 'sending', 'sent', { logicsDocumentId: 128346 })).toBe(true)
    expect(await move(id1, 'sent', 'failed')).toBe(false)
    expect(await move(id1, 'sent', 'unknown')).toBe(false)
    expect(await row(id1)).toMatchObject({ state: 'sent', logics_document_id: 128346 })
    expect((await row(id1)).sent_at).toBeTruthy()

    expect(await claimPush(env, id2)).not.toBeNull()
    expect(await move(id2, 'sending', 'unknown', { errorCode: 'logics_5xx' })).toBe(true)
    expect(await move(id2, 'unknown', 'queued')).toBe(false)
    expect(await row(id2)).toMatchObject({ state: 'unknown', error_code: 'logics_5xx' })

    const x = await insertRow('unknown')
    expect(await move(x, 'unknown', 'sent', { actorId: TEST_STAFF_UUID })).toBe(true)
    expect(await row(x)).toMatchObject({ state: 'sent', resolved_by: TEST_STAFF_UUID })
    const y = await insertRow('unknown')
    expect(await move(y, 'unknown', 'failed', { errorCode: 'discarded' })).toBe(true)
    expect(await move(y, 'failed', 'sent', { logicsDocumentId: 1 })).toBe(false)
  })

  it('(e) two concurrent finalizes: one result with 1 sent and 1 unknown; the note is recorded once', async () => {
    const results = await Promise.all([finalizeBatch(env, batch1), finalizeBatch(env, batch1)])
    const won = results.filter(Boolean)
    expect(won).toHaveLength(1)
    expect(won[0]!.sent).toHaveLength(1)
    expect(won[0]!.unknown).toHaveLength(1)
    expect(won[0]!.all_failed).toBe(false)
    await recordBatchActivity(env, { batchId: batch1, state: 'sent', activityId: 9164821 })
    await recordBatchActivity(env, { batchId: batch1, state: 'failed', error: 'second' })
    const b = (await db.from('logics_push_batches').select('*').eq('id', batch1).single()).data!
    expect(b).toMatchObject({ activity_state: 'sent', logics_activity_id: 9164821, activity_error: null })
  })

  it('(f) a second live row with a sent fingerprint fails with 23505', async () => {
    const { error } = await db.from('logics_pushes').insert({
      batch_id: batch1,
      firm_id: TEST_FIRM_ID,
      case_id: fx.case_id,
      request_id: fx.request_id,
      document_id: docA,
      file_name: 'dup.pdf',
      state: 'queued',
      mode: 'fake',
      request_fingerprint: (await row(id1)).request_fingerprint,
      created_by: TEST_STAFF_UUID,
    })
    expect(error?.code).toBe('23505')
  })

  it('(g) staff resolution: mark_sent without an id, resend refused on sent, resend of unknown', async () => {
    await expect(resolvePush(env, { pushId: id2, firmId: TEST_FIRM_ID, action: 'mark_sent', actorId: TEST_STAFF_UUID })).resolves.toEqual({
      state: 'sent',
      new_push_id: null,
    })
    expect(await row(id2)).toMatchObject({ state: 'sent', resolved_by: TEST_STAFF_UUID, logics_document_id: null })
    await expect(resolvePush(env, { pushId: id1, firmId: TEST_FIRM_ID, action: 'resend', actorId: TEST_STAFF_UUID })).rejects.toThrow(
      'not_resolvable'
    )
    await expect(
      resolvePush(env, { pushId: id1, firmId: '00000000-0000-0000-0000-0000000000ff', action: 'mark_sent', actorId: TEST_STAFF_UUID })
    ).rejects.toThrow('not_found')

    const z = await insertRow('unknown', { error_code: 'logics_no_response' })
    const resent = await resolvePush(env, { pushId: z, firmId: TEST_FIRM_ID, action: 'resend', actorId: TEST_STAFF_UUID })
    expect(resent.state).toBe('failed')
    expect(resent.new_push_id).toMatch(/^[0-9a-f-]{36}$/)
    const old = await row(z)
    expect(old).toMatchObject({ state: 'failed', error_code: 'resent_by_staff', resolved_by: TEST_STAFF_UUID })
    expect(await row(resent.new_push_id!)).toMatchObject({ state: 'queued', request_fingerprint: old.request_fingerprint, batch_id: scratch })
  })

  it('(h) a batch whose only part failed is skipped with all_failed', async () => {
    const created = await batch([docD])
    const [id4] = created.pushIds
    expect(await claimPush(env, id4)).not.toBeNull()
    expect(await move(id4, 'sending', 'failed', { errorCode: 'logics_rejected_400' })).toBe(true)
    expect(await move(id4, 'failed', 'failed', { errorCode: 'logics_rejected_400' })).toBe(true)
    const done = await finalizeBatch(env, created.batchId)
    expect(done).toMatchObject({ all_failed: true, sent: [], unknown: [] })
    const b = (await db.from('logics_push_batches').select('activity_state').eq('id', created.batchId).single()).data!
    expect(b.activity_state).toBe('skipped')
    expect(await finalizeBatch(env, created.batchId)).toBeNull()
  })

  it('(i) the sweeper moves stale sending rows to unknown and lists orphaned queued rows', async () => {
    const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()
    const stale = await insertRow('sending', { claimed_at: ago(11) })
    const fresh = await insertRow('sending', { claimed_at: ago(1) })
    const orphan = await insertRow('queued', { updated_at: ago(6) })
    const { data, error } = await db.rpc('logics_push_sweep')
    expect(error).toBeNull()
    expect((data as { swept: number }).swept).toBeGreaterThanOrEqual(1)
    expect((data as { requeue: string[] }).requeue).toContain(orphan)
    expect(await row(stale)).toMatchObject({ state: 'unknown', error_code: 'consumer_lost' })
    expect(await row(fresh)).toMatchObject({ state: 'sending' })
    await db.from('logics_pushes').update({ state: 'failed' }).eq('id', fresh) // unblock the case
  })

  it('(j) every transition wrote its event', async () => {
    for (const action of [
      'logics.push_queued',
      'logics.push_sending',
      'logics.push_sent',
      'logics.push_unknown',
      'logics.push_resolved',
      'logics.activity_sent',
    ]) {
      const { data } = await db.from('events').select('id').eq('request_id', fx.request_id).eq('action', action)
      expect(data!.length, action).toBeGreaterThan(0)
    }
  })
})
