import { Hono, type Context, type MiddlewareHandler } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import {
  completeUpload,
  countActiveDocuments,
  createUploadingDocument,
  findSessionDocument,
  findSessionItem,
  listItemDocuments,
  markDocumentDeleted,
  sessionRequest,
  type SessionCtx,
} from '../db/documents'
import { clientSession, requireClientHeader, type ClientCtx } from '../middleware/client-session'
import {
  ACCEPTED_MIMES,
  headBytes,
  MAX_BYTES,
  MAX_FILES_PER_ITEM,
  removeObject,
  signedUploadToken,
  sniffType,
  type AcceptedMime,
} from '../storage/case-documents'

type Env_ = { Bindings: Env; Variables: { client: ClientCtx; errorCode?: string } }
type Ctx = Context<Env_>

const SHA256 = /^[a-f0-9]{64}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Plain-sentence messages (the client copy lives in the SPA); the envelope matches app.onError.
function fail(c: Ctx, status: ContentfulStatusCode, code: string, message: string) {
  c.set('errorCode', code)
  return c.json({ error: { code, message } }, status)
}
const badRequest = (c: Ctx) => fail(c, 400, 'bad_request', 'That request was not valid.')
const notFound = (c: Ctx) => fail(c, 404, 'not_found', 'Not found')

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1

const session = (c: Ctx): Pick<SessionCtx, 'link_id' | 'request_id' | 'firm_id'> => ({
  link_id: c.var.client.linkId,
  request_id: c.var.client.requestId,
  firm_id: c.var.client.firmId,
})

// /api/c/*: identity is the rs_client cookie only. Bytes go browser → Storage; the Worker mints
// tokens and reads at most 16 bytes of a stored object (C14, D-01, D-03).
// Per route, not use('*'): a '*' here would also match clientPortalRoute's paths and become their
// logged route. clientPortalRoute's own '*' clientSession already ran, so resolve the cookie only once.
const session_: MiddlewareHandler<Env_> = (c, next) =>
  (c.var.client as ClientCtx | undefined) ? next() : clientSession(c, next)

export const cUploadsRoute = new Hono<Env_>()
  .post('/items/:itemId/uploads', session_, requireClientHeader, async (c) => {
    const body: unknown = await c.req.json().catch(() => null)
    if (!isObject(body)) return badRequest(c)
    const { name, mime, size } = body
    if (typeof name !== 'string' || name.length < 1 || name.length > 200) return badRequest(c)
    if (typeof mime !== 'string' || !isCount(size)) return badRequest(c)
    if (!ACCEPTED_MIMES.includes(mime as AcceptedMime))
      return fail(c, 415, 'unsupported_type', 'We can take PDFs and photos (JPG, PNG, HEIC).')
    if (size > MAX_BYTES)
      return fail(c, 413, 'file_too_large', 'That file is too big (over 25 MB). Try a smaller scan or photo.')

    const s = session(c)
    const itemId = c.req.param('itemId')
    const item = UUID.test(itemId) ? await findSessionItem(c.env, s, itemId) : null
    if (!item) return notFound(c)
    if (item.kind !== 'upload') return fail(c, 409, 'item_not_upload', 'This step does not take files.')
    if (item.status === 'approved') return fail(c, 409, 'item_approved', 'Your agent already approved this item.')
    // shortcut: two simultaneous mints can both pass at 9 and reach 11; the bucket and per-file caps still hold. Upgrade to a FOR UPDATE count inside an RPC if a real client hits it.
    if ((await countActiveDocuments(c.env, item.id)) >= MAX_FILES_PER_ITEM)
      return fail(c, 409, 'too_many_files', 'You can add up to 10 files for this item.')
    const req = await sessionRequest(c.env, s.request_id, s.firm_id)
    if (!req) return notFound(c)

    const doc = await createUploadingDocument(c.env, { ...s, case_id: req.case_id }, item, {
      name,
      mime: mime as AcceptedMime,
      size,
    })
    const signed = await signedUploadToken(c.env, doc.storage_key)
    return c.json({ document_id: doc.id, path: signed.path, token: signed.token, signed_url: signed.signedUrl }, 201)
  })
  .post('/uploads/:documentId/complete', session_, requireClientHeader, async (c) => {
    const body: unknown = await c.req.json().catch(() => null)
    if (!isObject(body) || typeof body.sha256 !== 'string' || !SHA256.test(body.sha256) || !isCount(body.size))
      return badRequest(c)
    const { sha256, size } = body as { sha256: string; size: number }

    const s = session(c)
    const documentId = c.req.param('documentId')
    const doc = UUID.test(documentId) ? await findSessionDocument(c.env, s, documentId) : null
    if (!doc) return notFound(c)

    if (doc.status === 'ready') {
      // idempotent: report the current statuses without a second RPC or event
      const [item, req] = await Promise.all([
        findSessionItem(c.env, s, doc.request_item_id),
        sessionRequest(c.env, s.request_id, s.firm_id),
      ])
      return c.json({ document_status: 'ready', item_status: item?.status, request_status: req?.status, already: true })
    }
    if (doc.status !== 'uploading')
      return fail(c, 409, 'document_not_uploading', 'That file is no longer waiting for an upload.')

    const head = await headBytes(c.env, doc.storage_key)
    if (!head) return fail(c, 409, 'upload_incomplete', "We didn't get the whole file. Try again.")
    const discard = async () => {
      await removeObject(c.env, doc.storage_key)
      await markDocumentDeleted(c.env, doc.id)
    }
    if (sniffType(head.bytes) !== doc.mime_type) {
      await discard()
      return fail(c, 422, 'bad_file_type', 'That file is not a PDF or photo. Try again.')
    }
    const actual = head.size ?? size
    if (actual > MAX_BYTES) {
      await discard()
      return fail(c, 413, 'file_too_large', 'That file is too big (over 25 MB). Try a smaller scan or photo.')
    }
    let result: Awaited<ReturnType<typeof completeUpload>>
    try {
      result = await completeUpload(c.env, s, doc.id, actual, sha256)
    } catch (err) {
      // a concurrent delete or completion between the read above and the RPC's row lock
      const token = err instanceof Error ? err.message : ''
      if (token === 'document_not_found') return notFound(c)
      if (token === 'document_not_uploading')
        return fail(c, 409, 'document_not_uploading', 'That file is no longer waiting for an upload.')
      throw err
    }
    return c.json({
      document_status: result.document_status,
      item_status: result.item_status,
      request_status: result.request_status,
      ...(result.already ? { already: true } : {}),
    })
  })
  // A new token for the same object, so a reload can resume the upload (tokens expire after 2 h).
  .post('/uploads/:documentId/token', session_, requireClientHeader, async (c) => {
    const documentId = c.req.param('documentId')
    const doc = UUID.test(documentId) ? await findSessionDocument(c.env, session(c), documentId) : null
    if (!doc) return notFound(c)
    if (doc.status !== 'uploading')
      return fail(c, 409, 'document_not_uploading', 'That file is no longer waiting for an upload.')
    const signed = await signedUploadToken(c.env, doc.storage_key)
    return c.json({ document_id: doc.id, path: signed.path, token: signed.token, signed_url: signed.signedUrl })
  })
  .get('/items/:itemId/documents', session_, async (c) => {
    const itemId = c.req.param('itemId')
    const item = UUID.test(itemId) ? await findSessionItem(c.env, session(c), itemId) : null
    if (!item) return notFound(c)
    const documents = await listItemDocuments(c.env, item.id)
    return c.json({
      item: { id: item.id, label: item.label, status: item.status, rejection_note: item.rejection_note },
      documents: documents.map((d) => ({
        id: d.id,
        name: d.original_filename,
        mime: d.mime_type,
        size_bytes: d.size_bytes,
        status: d.status,
        uploaded_at: d.uploaded_at,
      })),
    })
  })
