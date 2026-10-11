import { Hono, type Context } from 'hono'
import { getIntegration } from '../db/integrations'
import {
  createBatch,
  fingerprintHex,
  getFirmRequestCase,
  listLedger,
  listPushableDocuments,
  resolvePush,
} from '../db/logics-pushes'
import { logicsWriteGuard } from '../integrations/logics/write-guard'
import type { LogicsPushJob } from '../jobs/logics-push'
import { staffAuth } from '../middleware/staff-auth'
import { notFound, readBody, requestIdParam, type AdminApp } from './admin-requests'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_DOCUMENTS = 50
const isUuidList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string' && UUID.test(x))

// Envelope with a human message the push sheet shows as is (fixed strings only, T-01-10).
const refuse = (c: Context<AdminApp>, status: 400 | 403 | 404 | 409 | 422 | 503, code: string, message = code) => {
  c.set('errorCode', code)
  return c.json({ error: { code, message } }, status)
}

const modeOf = (env: Env) => (env.LOGICS_MODE === 'live' ? 'live' : 'fake')

// RAISE tokens of migration 0006 -> HTTP; anything else falls through to onError's 500.
const RPC_STATUS: Record<string, 400 | 404 | 409 | 422> = {
  no_items: 400,
  bad_action: 400,
  request_not_found: 404,
  not_found: 404,
  already_pushed: 409,
  not_resolvable: 409,
  not_pushable: 422,
}
function rpcRefusal(c: Context<AdminApp>, e: unknown) {
  const token = e instanceof Error ? e.message : ''
  const status = RPC_STATUS[token]
  if (!status) throw e
  return refuse(c, status, token === 'request_not_found' ? 'not_found' : token === 'bad_action' ? 'bad_request' : token)
}

const enqueue = (env: Env, ref: string) => env.JOBS.send({ type: 'logics_push', provider: 'logics', ref } satisfies LogicsPushJob)

export const adminLogicsPushRoute = new Hono<AdminApp>()
  .use('/requests/*', staffAuth)
  .use('/logics-pushes/*', staffAuth)
  // PUSH-01: one batch, one queued row and one queue message (ids only) per document.
  .post('/requests/:id/logics-push', async (c) => {
    const { staff } = c.var
    const id = requestIdParam(c)
    const body = await readBody(c)
    const pushAgain = body.push_again ?? []
    if (!Array.isArray(body.document_ids)) return refuse(c, 400, 'bad_request')
    if (body.document_ids.length === 0) return refuse(c, 400, 'no_items')
    if (body.document_ids.length > MAX_DOCUMENTS || !isUuidList(body.document_ids) || !isUuidList(pushAgain)) {
      return refuse(c, 400, 'bad_request')
    }
    const documentIds = [...new Set(body.document_ids)]

    const request = await getFirmRequestCase(c.env, staff.firmId, id)
    if (!request) throw notFound()
    // The Logics CaseID comes from the confirmed case only, never from the body.
    if (request.logics_case_id === null) return refuse(c, 422, 'not_pushable', 'This case has no Logics CaseID')
    if (c.env.LOGICS_WRITE_ENABLED !== 'true') {
      return refuse(c, 403, 'logics_write_blocked', 'Logics writes are disabled in this environment')
    }
    try {
      logicsWriteGuard(c.env, String(request.logics_case_id))
    } catch {
      return refuse(c, 403, 'logics_write_blocked', `Case ${request.logics_case_id} is not on the test allowlist`)
    }

    const mode = modeOf(c.env)
    const integration = await getIntegration(c.env, staff.firmId, 'logics')
    if (mode === 'live' && !(integration?.api_key_ciphertext && integration.secret_ciphertext && integration.last_test_ok === true)) {
      return refuse(c, 503, 'logics_no_credentials')
    }
    // D-08 firm settings (migration 0006 column; not yet on FirmIntegrationRow).
    const settings = (integration as { settings?: Record<string, unknown> } | null)?.settings ?? {}
    const fileCategoryId = Number.isInteger(settings.file_category_id) ? (settings.file_category_id as number) : null
    const activityType =
      typeof settings.activity_type === 'string' && settings.activity_type ? settings.activity_type : 'General'

    const pushable = new Map((await listPushableDocuments(c.env, staff.firmId, id)).map((d) => [d.id, d]))
    const items: Array<{ documentId: string; fingerprint: string; fileName: string }> = []
    for (const documentId of documentIds) {
      const d = pushable.get(documentId)
      if (!d || d.item_status !== 'approved' || !d.size_bytes || d.size_bytes <= 0 || !d.sha256) {
        return refuse(c, 422, 'not_pushable', `Document ${documentId} is not an approved, ready file`)
      }
      items.push({ documentId, fingerprint: await fingerprintHex(request.case_id, d.sha256, 0), fileName: d.original_filename })
    }

    let created: { batchId: string; pushIds: string[] }
    try {
      created = await createBatch(c.env, {
        firmId: staff.firmId,
        requestId: id,
        actorId: staff.userId,
        agentDisplayName: staff.displayName,
        mode,
        fileCategoryId,
        activityType,
        items,
        pushAgain,
      })
    } catch (e) {
      return rpcRefusal(c, e)
    }
    // shortcut: a send that fails after the RPC commits leaves the row queued; Plan 03's sweeper re-enqueues it.
    for (const ref of created.pushIds) await enqueue(c.env, ref)
    return c.json({ batch_id: created.batchId, push_ids: created.pushIds, mode }, 202)
  })
  .get('/requests/:id/logics-pushes', async (c) => {
    const id = requestIdParam(c)
    if (!(await getFirmRequestCase(c.env, c.var.staff.firmId, id))) throw notFound()
    const { batches } = await listLedger(c.env, c.var.staff.firmId, id)
    return c.json({ mode: modeOf(c.env), batches })
  })
  // D-04: staff resolution of unknown/failed rows; the only path that queues a second POST.
  .post('/logics-pushes/:pushId/resolve', async (c) => {
    const pushId = c.req.param('pushId')
    const { action, logics_document_id } = await readBody(c)
    if (!UUID.test(pushId) || (action !== 'mark_sent' && action !== 'resend')) return refuse(c, 400, 'bad_request')
    const docId = logics_document_id ?? null
    if (docId !== null && !(Number.isInteger(docId) && (docId as number) > 0)) return refuse(c, 400, 'bad_request')
    let result: Awaited<ReturnType<typeof resolvePush>>
    try {
      result = await resolvePush(c.env, {
        pushId,
        firmId: c.var.staff.firmId,
        action,
        actorId: c.var.staff.userId,
        logicsDocumentId: docId as number | null,
      })
    } catch (e) {
      return rpcRefusal(c, e)
    }
    if (action === 'resend' && result.new_push_id) await enqueue(c.env, result.new_push_id)
    return c.json(result)
  })
