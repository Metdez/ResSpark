import { Hono, type Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { getCaseAddress } from '../db/case-address'
import { logEvent } from '../db/events'
import {
  approveItem,
  findFirmDocument,
  getFirmRequest,
  getLatestClientSession,
  listItemsWithDocuments,
  rejectItem,
  ReviewError,
} from '../db/review'
import { listRequestSignatures } from '../db/signature-view'
import { staffAuth } from '../middleware/staff-auth'
import { ACCEPTED_MIMES, signedReadUrl } from '../storage/case-documents'
import { readBody, type AdminApp } from './admin-requests'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EXPIRES_IN = 300 // D-05: 5-minute signed URL, minted per click, never stored
const MAX_NOTE = 500

const fail = (status: 400 | 404 | 409 | 500, code: string) => new HTTPException(status, { message: code })

// A malformed id gets the same 404 as a foreign one: no cast error, no existence oracle (T-03-12).
function idParam(c: Context<AdminApp>, name: string): string {
  const id = c.req.param(name) ?? ''
  if (!UUID.test(id)) throw fail(404, 'not_found')
  return id
}

const toHttp = (e: unknown) => (e instanceof ReviewError ? fail(e.status, e.code) : e)

export const adminReviewRoute = new Hono<AdminApp>()
  .use('*', staffAuth)
  .get('/requests/:id/review', async (c) => {
    const { firmId } = c.var.staff
    const request = await getFirmRequest(c.env, firmId, idParam(c, 'id'))
    if (!request) throw fail(404, 'not_found')
    const [items, client_session, address, signatures] = await Promise.all([
      listItemsWithDocuments(c.env, request.id),
      getLatestClientSession(c.env, request.id),
      getCaseAddress(c.env, request.case_id),
      listRequestSignatures(c.env, firmId, request.id),
    ])
    return c.json({ request, items, client_session, address, signatures })
  })
  .get('/documents/:id/url', async (c) => {
    const { firmId, userId } = c.var.staff
    const asked = c.req.query('disposition') ?? 'inline'
    if (asked !== 'inline' && asked !== 'attachment') throw fail(400, 'bad_request')
    const doc = await findFirmDocument(c.env, firmId, idParam(c, 'id'))
    if (!doc || (doc.status !== 'ready' && doc.status !== 'rejected')) throw fail(404, 'not_found')
    // Only types the upload sniff accepted may render in the browser; anything else downloads.
    const disposition = asked === 'inline' && (ACCEPTED_MIMES as readonly string[]).includes(doc.mime_type) ? 'inline' : 'attachment'
    const url = await signedReadUrl(c.env, doc.storage_key, {
      download: disposition === 'attachment' ? doc.original_filename : false,
      expiresIn: EXPIRES_IN,
    })
    // Audit only, no state change, so log_event directly rather than an RPC. The URL is never logged.
    await logEvent(c.env, {
      firm_id: firmId,
      case_id: doc.case_id,
      request_id: doc.request_id,
      actor_type: 'staff',
      actor_id: userId,
      action: 'document.viewed',
      payload: { document_id: doc.id, disposition },
    })
    return c.json({ url, expires_in: 300, disposition })
  })
  .post('/items/:itemId/approve', async (c) => {
    const { firmId, userId } = c.var.staff
    try {
      const r = await approveItem(c.env, firmId, idParam(c, 'itemId'), userId)
      return c.json({ item_status: r.item_status, request_status: r.request_status })
    } catch (e) {
      throw toHttp(e)
    }
  })
  .post('/items/:itemId/reject', async (c) => {
    const { firmId, userId } = c.var.staff
    const itemId = idParam(c, 'itemId')
    const { note } = await readBody(c)
    const trimmed = typeof note === 'string' ? note.trim() : ''
    if (!trimmed) throw fail(400, 'note_required')
    if (trimmed.length > MAX_NOTE) throw fail(400, 'note_too_long')
    try {
      const r = await rejectItem(c.env, firmId, itemId, trimmed, userId)
      return c.json({ item_status: r.item_status, request_status: r.request_status })
    } catch (e) {
      throw toHttp(e)
    }
  })
