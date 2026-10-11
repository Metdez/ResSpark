import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getIntegration, type FirmIntegrationRow } from '../db/integrations'
import { createBatch, getFirmRequestCase, listLedger, listPushableDocuments, resolvePush } from '../db/logics-pushes'
import { adminLogicsPushRoute } from './admin-logics-push'

vi.mock('../middleware/staff-auth', async () => {
  const { createMiddleware } = await import('hono/factory')
  return {
    staffAuth: createMiddleware(async (c, next) => {
      c.set('staff', { userId: 'U1', firmId: 'F1', role: 'staff', displayName: 'Dana Agent' })
      await next()
    }),
  }
})
vi.mock('../db/integrations', () => ({ getIntegration: vi.fn() }))
vi.mock('../db/logics-pushes', () => ({
  createBatch: vi.fn(),
  fingerprintHex: vi.fn(async (c: string, s: string, i: number) => `fp:${c}:${s}:${i}`),
  getFirmRequestCase: vi.fn(),
  listLedger: vi.fn(),
  listPushableDocuments: vi.fn(),
  resolvePush: vi.fn(),
}))

const REQ = '11111111-1111-4111-8111-111111111111'
const DOC = '22222222-2222-4222-8222-222222222222'
const PUSH = '33333333-3333-4333-8333-333333333333'
const send = vi.fn()
const envOf = (over: Partial<Record<string, string>> = {}) =>
  ({ LOGICS_MODE: 'fake', LOGICS_WRITE_ENABLED: 'true', LOGICS_TEST_CASE_IDS: '900001', JOBS: { send }, ...over }) as unknown as Env

// Same envelope as index.ts onError, without pulling the whole Worker.
const app = new Hono<{ Bindings: Env }>()
  .route('/api/admin', adminLogicsPushRoute)
  .onError((e, c) => c.json({ error: { code: e instanceof HTTPException ? e.message : 'internal' } }, e instanceof HTTPException ? e.status : 500))
const post = (path: string, body: unknown, env = envOf()) =>
  app.request(`/api/admin${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, env)
const pushDocs = (body: unknown, env?: Env) => post(`/requests/${REQ}/logics-push`, body, env)
const errorOf = async (res: Response) => ((await res.json()) as { error: { code: string; message?: string } }).error
const pushable = (over: Record<string, unknown> = {}) => ({
  id: DOC,
  original_filename: 'stmt.pdf',
  mime_type: 'application/pdf',
  size_bytes: 2048,
  sha256: 'abc',
  item_label: 'Statements',
  item_status: 'approved',
  status: 'ready',
  ...over,
})

beforeEach(() => {
  vi.mocked(getFirmRequestCase).mockResolvedValue({ id: REQ, case_id: 'C1', logics_case_id: 900001 })
  vi.mocked(getIntegration).mockResolvedValue(null)
  vi.mocked(listPushableDocuments).mockResolvedValue([pushable()])
  vi.mocked(createBatch).mockResolvedValue({ batchId: 'B1', pushIds: [PUSH] })
})
afterEach(() => vi.clearAllMocks())

describe('POST /requests/:id/logics-push', () => {
  it('400 no_items for an empty selection, 400 bad_request for 51 ids', async () => {
    expect(await errorOf(await pushDocs({ document_ids: [] }))).toMatchObject({ code: 'no_items' })
    const res = await pushDocs({ document_ids: Array.from({ length: 51 }, () => DOC) })
    expect(res.status).toBe(400)
    expect((await errorOf(res)).code).toBe('bad_request')
  })

  it('403 with the disabled message when writes are off, and no batch', async () => {
    const res = await pushDocs({ document_ids: [DOC] }, envOf({ LOGICS_WRITE_ENABLED: 'false' }))
    expect(res.status).toBe(403)
    expect(await errorOf(res)).toEqual({ code: 'logics_write_blocked', message: 'Logics writes are disabled in this environment' })
    expect(createBatch).not.toHaveBeenCalled()
  })

  it('403 with the allowlist message for an unlisted case', async () => {
    const res = await pushDocs({ document_ids: [DOC] }, envOf({ LOGICS_TEST_CASE_IDS: '1' }))
    expect(res.status).toBe(403)
    expect((await errorOf(res)).message).toBe('Case 900001 is not on the test allowlist')
    expect(createBatch).not.toHaveBeenCalled()
  })

  it('404 for a request of another firm', async () => {
    vi.mocked(getFirmRequestCase).mockResolvedValue(null)
    expect((await pushDocs({ document_ids: [DOC] })).status).toBe(404)
  })

  it('422 not_pushable for a document whose item is not approved', async () => {
    vi.mocked(listPushableDocuments).mockResolvedValue([pushable({ item_status: 'submitted' })])
    const res = await pushDocs({ document_ids: [DOC] })
    expect(res.status).toBe(422)
    expect((await errorOf(res)).code).toBe('not_pushable')
    expect(createBatch).not.toHaveBeenCalled()
  })

  it('503 logics_no_credentials in live mode without a tested integration', async () => {
    const res = await pushDocs({ document_ids: [DOC] }, envOf({ LOGICS_MODE: 'live' }))
    expect(res.status).toBe(503)
    expect((await errorOf(res)).code).toBe('logics_no_credentials')
  })

  it('202 in fake mode: one batch with the staff agent and defaults, one message per push', async () => {
    const res = await pushDocs({ document_ids: [DOC] })
    expect(res.status).toBe(202)
    expect(await res.json()).toEqual({ batch_id: 'B1', push_ids: [PUSH], mode: 'fake' })
    expect(createBatch).toHaveBeenCalledWith(expect.anything(), {
      firmId: 'F1',
      requestId: REQ,
      actorId: 'U1',
      agentDisplayName: 'Dana Agent',
      mode: 'fake',
      fileCategoryId: null,
      activityType: 'General',
      items: [{ documentId: DOC, fingerprint: 'fp:C1:abc:0', fileName: 'stmt.pdf' }],
      pushAgain: [],
    })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith({ type: 'logics_push', provider: 'logics', ref: PUSH })
  })

  it('passes the firm settings through', async () => {
    vi.mocked(getIntegration).mockResolvedValue({
      settings: { file_category_id: 7, activity_type: 'Document sent' },
    } as unknown as FirmIntegrationRow)
    await pushDocs({ document_ids: [DOC] })
    expect(createBatch).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ fileCategoryId: 7, activityType: 'Document sent' }))
  })

  it('409 already_pushed from the ledger, nothing enqueued', async () => {
    vi.mocked(createBatch).mockRejectedValue(new Error('already_pushed'))
    const res = await pushDocs({ document_ids: [DOC] })
    expect(res.status).toBe(409)
    expect((await errorOf(res)).code).toBe('already_pushed')
    expect(send).not.toHaveBeenCalled()
  })
})

describe('GET /requests/:id/logics-pushes', () => {
  it('200 with the mode and the ledger', async () => {
    vi.mocked(listLedger).mockResolvedValue({ batches: [] })
    const res = await app.request(`/api/admin/requests/${REQ}/logics-pushes`, {}, envOf())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ mode: 'fake', batches: [] })
    expect(listLedger).toHaveBeenCalledWith(expect.anything(), 'F1', REQ)
  })
})

describe('POST /logics-pushes/:pushId/resolve', () => {
  const resolve = (body: unknown) => post(`/logics-pushes/${PUSH}/resolve`, body)

  it('400 bad_request for an unknown action', async () => {
    const res = await resolve({ action: 'discard' })
    expect(res.status).toBe(400)
    expect((await errorOf(res)).code).toBe('bad_request')
    expect(resolvePush).not.toHaveBeenCalled()
  })

  it('resend enqueues the new push id', async () => {
    vi.mocked(resolvePush).mockResolvedValue({ state: 'failed', new_push_id: 'NEW' })
    const res = await resolve({ action: 'resend' })
    expect(res.status).toBe(200)
    expect(resolvePush).toHaveBeenCalledWith(expect.anything(), {
      pushId: PUSH,
      firmId: 'F1',
      action: 'resend',
      actorId: 'U1',
      logicsDocumentId: null,
    })
    expect(send).toHaveBeenCalledWith({ type: 'logics_push', provider: 'logics', ref: 'NEW' })
  })

  it('409 not_resolvable from the ledger', async () => {
    vi.mocked(resolvePush).mockRejectedValue(new Error('not_resolvable'))
    const res = await resolve({ action: 'mark_sent', logics_document_id: 128346 })
    expect(res.status).toBe(409)
    expect((await errorOf(res)).code).toBe('not_resolvable')
  })
})
