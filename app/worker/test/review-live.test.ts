import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAdminClient } from '../src/db/client'
import {
  approveItem,
  findFirmDocument,
  getFirmRequest,
  getLatestClientSession,
  listCaseEvents,
  listItemsWithDocuments,
  rejectItem,
  ReviewError,
} from '../src/db/review'
import { cleanupRequest, liveEnvOrSkip, seedRequest, TEST_CASE_ID as CASE, TEST_FIRM_ID as FIRM } from './fixtures/request'

// db/review.ts against the live project: the PostgREST embeds, the firm joins and the RPC error mapping.
// Run with `pnpm -C app run test:live:file worker/test/review-live.test.ts`. Rows only, no Storage objects.
const live = liveEnvOrSkip()
const OTHER_FIRM = '00000000-0000-0000-0000-0000000000ff'
const STAFF = 'review-live-test'
const SAME_TIME = '2026-10-11T08:00:00.000Z'

describe.skipIf(!live)('staff review queries (live; needs SUPABASE_URL, SUPABASE_SECRET_KEY, CLIENT_LINK_HMAC_KEY)', () => {
  const env = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY } as unknown as Env
  let db: SupabaseClient
  let requestId = ''
  let items: string[] = []
  const docIds = ['', '', '']

  const doc = (itemId: string, name: string, status: string) => {
    const id = crypto.randomUUID()
    return {
      id,
      case_id: CASE,
      request_item_id: itemId,
      storage_key: `firm/${FIRM}/case/${CASE}/item/${itemId}/${id}/${name}`,
      original_filename: name,
      mime_type: 'application/pdf',
      document_type: 'test',
      status,
      uploaded_at: SAME_TIME,
      uploaded_by_actor: 'client:test',
    }
  }
  const expectReviewError = async (p: Promise<unknown>, code: string, status: number) => {
    const e = await p.then(
      () => null,
      (err: unknown) => err
    )
    expect(e).toBeInstanceOf(ReviewError)
    expect({ code: (e as ReviewError).code, status: (e as ReviewError).status }).toEqual({ code, status })
  }

  beforeAll(async () => {
    db = createAdminClient(env)
    const seeded = await seedRequest(db, {
      items: [
        { kind: 'upload', label: 'Bank statements', required: true, status: 'submitted' },
        { kind: 'upload', label: 'Pay stubs', required: false },
      ],
      status: 'opened',
      withLink: true,
    })
    requestId = seeded.request_id
    items = seeded.item_ids
    const rows = [doc(items[0], 'a.pdf', 'ready'), doc(items[0], 'b.pdf', 'ready'), doc(items[0], 'c.pdf', 'uploading')]
    rows.forEach((r, i) => (docIds[i] = r.id))
    const ins = await db.from('documents').insert(rows)
    if (ins.error) throw new Error(ins.error.message)
    const ses = await db.from('client_sessions').insert({ link_id: seeded.link_id, last_step: 'upload', last_error: null })
    if (ses.error) throw new Error(ses.error.message)
  })

  afterAll(async () => {
    if (db && requestId) await cleanupRequest(db, { request_id: requestId })
  })

  it('scopes the request to its firm', async () => {
    expect((await getFirmRequest(env, FIRM, requestId))?.case_id).toBe(CASE)
    expect(await getFirmRequest(env, OTHER_FIRM, requestId)).toBeNull()
  })

  it('lists items by position with ready documents only, equal timestamps ordered by id', async () => {
    const list = await listItemsWithDocuments(env, requestId)
    expect(list.map((i) => i.id)).toEqual(items)
    const ready = [docIds[0], docIds[1]].sort()
    expect(list[0].documents.map((d) => d.id)).toEqual(ready)
    expect(list[0].documents[0]).toMatchObject({ mime: 'application/pdf', status: 'ready' })
    expect(list[1].documents).toEqual([])
  })

  it('returns the latest client session of the request', async () => {
    expect(await getLatestClientSession(env, requestId)).toMatchObject({ last_step: 'upload', last_error: null })
  })

  it('finds a document only through its own firm', async () => {
    expect(await findFirmDocument(env, FIRM, docIds[0])).toMatchObject({ firm_id: FIRM, request_id: requestId, original_filename: 'a.pdf' })
    expect(await findFirmDocument(env, OTHER_FIRM, docIds[0])).toBeNull()
  })

  it('maps the RPC tokens: item_not_submitted 409, foreign firm 404', async () => {
    await expectReviewError(approveItem(env, FIRM, items[1], STAFF), 'item_not_submitted', 409)
    await expectReviewError(approveItem(env, OTHER_FIRM, items[0], STAFF), 'not_found', 404)
  })

  it('rejects the item and both ready documents with one note, then approves it once', async () => {
    const rejected = await rejectItem(env, FIRM, items[0], 'blurry', STAFF)
    expect(rejected.item_status).toBe('rejected')
    const docs = (await db.from('documents').select('id, status, rejection_note').in('id', [docIds[0], docIds[1]])).data!
    expect(docs.every((d) => d.status === 'rejected' && d.rejection_note === 'blurry')).toBe(true)

    const first = await approveItem(env, FIRM, items[0], STAFF)
    expect(first).toMatchObject({ item_status: 'approved' })
    const again = await approveItem(env, FIRM, items[0], STAFF)
    expect(again.already).toBe(true)
    const item = (await db.from('request_items').select('status, rejection_note').eq('id', items[0]).single()).data!
    expect(item).toEqual({ status: 'approved', rejection_note: null })
    const approvals = (await db.from('events').select('id').eq('request_id', requestId).eq('action', 'item.approved')).data!
    expect(approvals).toHaveLength(1)
  })

  it('lists the case events newest first and refuses a foreign firm', async () => {
    const events = (await listCaseEvents(env, FIRM, CASE, null, 50))!
    const mine = events.filter((e) => e.request_id === requestId).map((e) => e.action)
    expect(mine.slice(0, 2)).toEqual(['item.approved', 'item.rejected'])
    const times = events.map((e) => e.created_at)
    expect([...times].sort().reverse()).toEqual(times)
    expect(await listCaseEvents(env, OTHER_FIRM, CASE, null, 50)).toBeNull()
  })
})
