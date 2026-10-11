import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAdminClient } from '../src/db/client'
import { listItemDocuments } from '../src/db/documents'
import { cleanupRequest, liveEnvOrSkip, seedRequest, TEST_FIRM_ID as FIRM, type Seeded } from './fixtures/request'

// UPL-03/UPL-04 against the live project: every D-06 edge of request_status(), request_apply_status(),
// item_approve and item_reject. Run with `pnpm -C app run test:live:file worker/test/request-status.test.ts`.
// Rows are seeded under the test firm only and removed in afterAll; events stay (append-only).
const live = liveEnvOrSkip()

describe.skipIf(!live)('request status machine (live; needs SUPABASE_URL, SUPABASE_SECRET_KEY, CLIENT_LINK_HMAC_KEY)', () => {
  const env = { SUPABASE_URL: live?.url, SUPABASE_SECRET_KEY: live?.secret } as unknown as Env
  let db: SupabaseClient
  const seeded: Seeded[] = []
  let r1 = ''
  let a = ''
  let b = ''
  let bDoc = ''

  const derive = async (id: string) => {
    const { data, error } = await db.rpc('request_status', { p_request_id: id })
    expect(error).toBeNull()
    return data as string
  }
  const row = async (id: string) =>
    (await db.from('requests').select('status, completed_at').eq('id', id).single()).data as {
      status: string
      completed_at: string | null
    }
  // request_apply_status must store exactly what request_status derives.
  const apply = async (id: string) => {
    const derived = await derive(id)
    const { data, error } = await db.rpc('request_apply_status', { p_request_id: id })
    expect(error).toBeNull()
    expect(data).toBe(derived)
    expect((await row(id)).status).toBe(derived)
    return derived
  }
  const setItem = async (id: string, status: string) =>
    expect((await db.from('request_items').update({ status }).eq('id', id)).error).toBeNull()
  const addItem = async (request_id: string, position: number, required: boolean) =>
    (
      await db
        .from('request_items')
        .insert({ request_id, position, kind: 'upload', label: `Item ${position}`, required })
        .select('id')
        .single()
    ).data!.id as string
  const addDoc = async (itemId: string, id = crypto.randomUUID(), uploaded_at = new Date().toISOString()) => {
    const { error } = await db.from('documents').insert({
      id,
      case_id: seeded[0].case_id,
      request_item_id: itemId,
      storage_key: `test/request-status/${id}`,
      original_filename: 'doc.pdf',
      mime_type: 'application/pdf',
      status: 'ready',
      uploaded_at,
    })
    expect(error).toBeNull()
    return id
  }
  const approve = (item: string, firm = FIRM) =>
    db.rpc('item_approve', { p_item_id: item, p_firm_id: firm, p_actor_id: 'staff:test' })
  const reject = (item: string, note: string, firm = FIRM) =>
    db.rpc('item_reject', { p_item_id: item, p_firm_id: firm, p_note: note, p_actor_id: 'staff:test' })
  const events = async (request_id: string, action: string) =>
    (await db.from('events').select('id').eq('request_id', request_id).eq('action', action)).data!.length

  beforeAll(async () => {
    db = createAdminClient(env)
    seeded.push(await seedRequest(db, { items: [], status: 'opened' }))
    r1 = seeded[0].request_id
  })

  afterAll(async () => {
    for (const s of seeded) await cleanupRequest(db, s)
  })

  it('a request with no items derives opened, never complete (D-06 empty edge)', async () => {
    expect(await apply(r1)).toBe('opened')
    expect((await row(r1)).completed_at).toBeNull()
  })

  it('two required pending items → opened; one in_progress → in_progress; one submitted → waiting_on_staff', async () => {
    a = await addItem(r1, 1, true)
    b = await addItem(r1, 2, true)
    // "else opened/sent"
    expect(await apply(r1)).toBe('opened')
    // "in_progress when any item is in_progress/submitted/rejected after open"
    await setItem(a, 'in_progress')
    expect(await apply(r1)).toBe('in_progress')
    // "waiting_on_staff when any item is submitted"
    await setItem(a, 'submitted')
    expect(await apply(r1)).toBe('waiting_on_staff')
  })

  it('item_approve on a pending item raises item_not_submitted', async () => {
    const { data, error } = await approve(b)
    expect(data).toBeNull()
    expect(error?.message).toContain('item_not_submitted')
  })

  it('approve A logs one item.approved; approving again is idempotent with no second event', async () => {
    const first = await approve(a)
    expect(first.error).toBeNull()
    // D-06 counts only in_progress/submitted/rejected as activity: A approved + B pending derives opened.
    expect(first.data).toEqual({ item_status: 'approved', request_status: 'opened' })
    expect((await row(r1)).status).toBe('opened')
    expect(await events(r1, 'item.approved')).toBe(1)

    const again = await approve(a)
    expect(again.error).toBeNull()
    expect(again.data).toMatchObject({ item_status: 'approved', already: true })
    expect(await events(r1, 'item.approved')).toBe(1)
  })

  it('approving the last required item sets complete and completed_at (D-06 boundary)', async () => {
    bDoc = await addDoc(b)
    await setItem(b, 'submitted')
    expect(await apply(r1)).toBe('waiting_on_staff')
    const res = await approve(b)
    expect(res.error).toBeNull()
    expect(res.data).toEqual({ item_status: 'approved', request_status: 'complete' })
    const r = await row(r1)
    expect(r.status).toBe('complete')
    expect(r.completed_at).not.toBeNull()
  })

  it('rejecting after complete flips back to in_progress, clears completed_at, and rejects the ready documents (D-05)', async () => {
    const before = await events(r1, 'item.rejected')
    const res = await reject(b, 'blurry')
    expect(res.error).toBeNull()
    expect(res.data).toEqual({ item_status: 'rejected', request_status: 'in_progress' })
    expect(await row(r1)).toEqual({ status: 'in_progress', completed_at: null })
    const item = (await db.from('request_items').select('status, rejection_note').eq('id', b).single()).data
    expect(item).toEqual({ status: 'rejected', rejection_note: 'blurry' })
    const doc = (await db.from('documents').select('status, rejection_note').eq('id', bDoc).single()).data
    expect(doc).toEqual({ status: 'rejected', rejection_note: 'blurry' })
    expect(await events(r1, 'item.rejected')).toBe(before + 1)
  })

  it('item_reject with a blank note raises note_required', async () => {
    const { data, error } = await reject(b, '   ')
    expect(data).toBeNull()
    expect(error?.message).toContain('note_required')
  })

  it('re-submitting and approving sets complete and completed_at again', async () => {
    await setItem(b, 'submitted')
    expect(await apply(r1)).toBe('waiting_on_staff')
    const res = await approve(b)
    expect(res.data).toEqual({ item_status: 'approved', request_status: 'complete' })
    expect((await row(r1)).completed_at).not.toBeNull()
  })

  it('adding an optional pending item to a complete request leaves it complete (D-06 adjacency)', async () => {
    const completedAt = (await row(r1)).completed_at
    await addItem(r1, 3, false)
    expect(await apply(r1)).toBe('complete')
    expect((await row(r1)).completed_at).toBe(completedAt)
  })

  it('another firm id cannot approve or reject the item (item_not_found)', async () => {
    const other = crypto.randomUUID()
    const approved = await approve(a, other)
    expect(approved.data).toBeNull()
    expect(approved.error?.message).toContain('item_not_found')
    const rejected = await reject(a, 'nope', other)
    expect(rejected.data).toBeNull()
    expect(rejected.error?.message).toContain('item_not_found')
  })

  it('zero required items: an optional submitted item → waiting_on_staff, then complete once approved', async () => {
    const s = await seedRequest(db, { items: [{ kind: 'upload', label: 'Optional', required: false, status: 'submitted' }] })
    seeded.push(s)
    expect(await apply(s.request_id)).toBe('waiting_on_staff')
    const res = await approve(s.item_ids[0])
    expect(res.data).toEqual({ item_status: 'approved', request_status: 'complete' })
    expect((await row(s.request_id)).completed_at).not.toBeNull()
  })

  it('documents with the same uploaded_at list in id order (listItemDocuments)', async () => {
    const at = '2026-10-11T00:00:00.000Z'
    const ids = [crypto.randomUUID(), crypto.randomUUID()].sort()
    // Insert the higher id first so insertion order cannot pass for id order.
    await addDoc(a, ids[1], at)
    await addDoc(a, ids[0], at)
    const docs = await listItemDocuments(env, a)
    expect(docs.map((d) => d.id)).toEqual(ids)
  })
})
