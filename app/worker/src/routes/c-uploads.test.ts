import { createMiddleware } from 'hono/factory'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as docs from '../db/documents'
import type { DocumentRow, ItemRow } from '../db/documents'
import { app } from '../index'
import * as storage from '../storage/case-documents'

// Unit tests for the client upload routes: no network. db/documents and the Storage calls are
// mocked; requireClientHeader stays real (a pure header check); clientSession sets a fixed session.
vi.mock('../db/documents')
vi.mock('../storage/case-documents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../storage/case-documents')>()),
  signedUploadToken: vi.fn(),
  headBytes: vi.fn(),
  removeObject: vi.fn(),
  signedReadUrl: vi.fn(),
}))
vi.mock('../middleware/client-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../middleware/client-session')>()),
  clientSession: createMiddleware(async (c, next) => {
    c.set('client', { linkId: 'L1', requestId: 'R1', firmId: 'F1', expiresAt: '2099-01-01T00:00:00Z', openedAt: null })
    await next()
  }),
}))

const ENV = { SUPABASE_URL: 'https://unit.supabase.test', SUPABASE_SECRET_KEY: 'unit' } as unknown as Env
const ITEM_ID = '11111111-1111-4111-8111-111111111111'
const DOC_ID = '22222222-2222-4222-8222-222222222222'
const KEY = `firm/F1/case/C1/item/${ITEM_ID}/${DOC_ID}/id.jpg`
const SHA = 'a'.repeat(64)

const item = (over: Partial<ItemRow> = {}): ItemRow => ({
  id: ITEM_ID,
  request_id: 'R1',
  position: 1,
  kind: 'upload',
  label: 'Government ID',
  required: true,
  status: 'pending',
  rejection_note: null,
  config: { doc_code: 'government_id' },
  ...over,
})
const doc = (over: Partial<DocumentRow> = {}): DocumentRow => ({
  id: DOC_ID,
  case_id: 'C1',
  request_item_id: ITEM_ID,
  storage_key: KEY,
  original_filename: 'id.jpg',
  mime_type: 'image/jpeg',
  size_bytes: null,
  sha256: null,
  status: 'uploading',
  uploaded_at: '2026-10-11T08:00:00.000Z',
  rejection_note: null,
  ...over,
})
const TOKEN = { token: 'tok', path: KEY, signedUrl: 'https://unit.supabase.test/storage/v1/object/upload/sign/x?token=tok' }

const send = (method: string, path: string, body?: unknown, header = true) => {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (header) headers['X-Requested-With'] = 'ResSpark'
  return app.request(`/api/c${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, ENV)
}
const mint = (body: unknown = { name: 'id.jpg', mime: 'image/jpeg', size: 1024 }, header = true) =>
  send('POST', `/items/${ITEM_ID}/uploads`, body, header)
const complete = (body: unknown = { sha256: SHA, size: 1024 }, header = true) =>
  send('POST', `/uploads/${DOC_ID}/complete`, body, header)
const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code
const dbCalls = () => Object.values(docs).filter((f) => vi.isMockFunction(f) && f.mock.calls.length > 0).length

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.mocked(docs.findSessionItem).mockResolvedValue(item())
  vi.mocked(docs.sessionRequest).mockResolvedValue({ case_id: 'C1', status: 'opened' })
  vi.mocked(docs.countActiveDocuments).mockResolvedValue(0)
  vi.mocked(docs.createUploadingDocument).mockResolvedValue(doc())
  vi.mocked(docs.findSessionDocument).mockResolvedValue(doc())
  vi.mocked(docs.listItemDocuments).mockResolvedValue([])
  vi.mocked(docs.completeUpload).mockResolvedValue({
    document_status: 'ready',
    item_status: 'submitted',
    request_status: 'waiting_on_staff',
  })
  vi.mocked(storage.signedUploadToken).mockResolvedValue(TOKEN)
  vi.mocked(storage.headBytes).mockResolvedValue({ bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), size: 1024 })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('CSRF header', () => {
  it.each([
    ['mint', () => mint(undefined, false)],
    ['complete', () => complete(undefined, false)],
    ['token', () => send('POST', `/uploads/${DOC_ID}/token`, {}, false)],
  ])('%s without X-Requested-With → 403 bad_origin, no db call', async (_name, call) => {
    const res = await call()
    expect(res.status).toBe(403)
    expect(await code(res)).toBe('bad_origin')
    expect(dbCalls()).toBe(0)
  })
})

describe('POST /items/:itemId/uploads', () => {
  it('201 with the signed token for the new document', async () => {
    const res = await mint()
    expect(res.status).toBe(201)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ document_id: DOC_ID, path: KEY, token: 'tok', signed_url: TOKEN.signedUrl })
    expect(storage.signedUploadToken).toHaveBeenCalledWith(ENV, KEY)
  })

  it.each([
    ['heic', { name: 'a.heic', mime: 'image/heic', size: 10 }, 415, 'unsupported_type'],
    ['size 0', { name: 'a.jpg', mime: 'image/jpeg', size: 0 }, 400, 'bad_request'],
    ['size over 25 MiB', { name: 'a.jpg', mime: 'image/jpeg', size: 26_214_401 }, 413, 'file_too_large'],
    ['name of 201 chars', { name: 'a'.repeat(201), mime: 'image/jpeg', size: 10 }, 400, 'bad_request'],
    ['not an object', [1, 2], 400, 'bad_request'],
  ])('%s → %i %s', async (_name, body, status, errorCode) => {
    const res = await mint(body)
    expect(res.status).toBe(status)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await code(res)).toBe(errorCode)
    expect(docs.createUploadingDocument).not.toHaveBeenCalled()
  })

  it('item of another request → 404 not_found', async () => {
    vi.mocked(docs.findSessionItem).mockResolvedValue(null)
    const res = await mint()
    expect(res.status).toBe(404)
    expect(await code(res)).toBe('not_found')
  })

  it.each([
    ['not an upload item', { kind: 'bank_connect' }, 'item_not_upload'],
    ['already approved', { status: 'approved' }, 'item_approved'],
  ])('%s → 409', async (_name, over, errorCode) => {
    vi.mocked(docs.findSessionItem).mockResolvedValue(item(over))
    const res = await mint()
    expect(res.status).toBe(409)
    expect(await code(res)).toBe(errorCode)
    expect(docs.createUploadingDocument).not.toHaveBeenCalled()
  })

  it('10 active files → 409 too_many_files', async () => {
    vi.mocked(docs.countActiveDocuments).mockResolvedValue(10)
    const res = await mint()
    expect(res.status).toBe(409)
    expect(await code(res)).toBe('too_many_files')
    expect(docs.createUploadingDocument).not.toHaveBeenCalled()
  })
})

describe('POST /uploads/:documentId/complete', () => {
  it('200 with the RPC statuses', async () => {
    const res = await complete()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ document_status: 'ready', item_status: 'submitted', request_status: 'waiting_on_staff' })
    expect(docs.completeUpload).toHaveBeenCalledWith(ENV, expect.objectContaining({ request_id: 'R1' }), DOC_ID, 1024, SHA)
  })

  it('bad sha256 → 400', async () => {
    const res = await complete({ sha256: 'xyz', size: 1024 })
    expect(res.status).toBe(400)
    expect(await code(res)).toBe('bad_request')
  })

  it('document of another request → 404', async () => {
    vi.mocked(docs.findSessionDocument).mockResolvedValue(null)
    const res = await complete()
    expect(res.status).toBe(404)
    expect(await code(res)).toBe('not_found')
  })

  it('object not in Storage → 409 upload_incomplete', async () => {
    vi.mocked(storage.headBytes).mockResolvedValue(null)
    const res = await complete()
    expect(res.status).toBe(409)
    expect(await code(res)).toBe('upload_incomplete')
    expect(docs.completeUpload).not.toHaveBeenCalled()
  })

  it('magic-byte mismatch → object removed, row deleted, 422', async () => {
    vi.mocked(storage.headBytes).mockResolvedValue({ bytes: new TextEncoder().encode('GIF89a'), size: 6 })
    const res = await complete()
    expect(res.status).toBe(422)
    expect(await code(res)).toBe('bad_file_type')
    expect(storage.removeObject).toHaveBeenCalledTimes(1)
    expect(storage.removeObject).toHaveBeenCalledWith(ENV, KEY)
    expect(docs.markDocumentDeleted).toHaveBeenCalledTimes(1)
    expect(docs.completeUpload).not.toHaveBeenCalled()
  })

  it('already ready → 200 without the RPC', async () => {
    vi.mocked(docs.findSessionDocument).mockResolvedValue(doc({ status: 'ready', size_bytes: 1024, sha256: SHA }))
    vi.mocked(docs.findSessionItem).mockResolvedValue(item({ status: 'submitted' }))
    const res = await complete()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ document_status: 'ready', item_status: 'submitted', already: true })
    expect(docs.completeUpload).not.toHaveBeenCalled()
  })
})

describe('POST /uploads/:documentId/token', () => {
  it('ready document → 409 document_not_uploading', async () => {
    vi.mocked(docs.findSessionDocument).mockResolvedValue(doc({ status: 'ready' }))
    const res = await send('POST', `/uploads/${DOC_ID}/token`, {})
    expect(res.status).toBe(409)
    expect(await code(res)).toBe('document_not_uploading')
    expect(storage.signedUploadToken).not.toHaveBeenCalled()
  })

  it('uploading document → 200 with a new token for the same path', async () => {
    const res = await send('POST', `/uploads/${DOC_ID}/token`, {})
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ document_id: DOC_ID, path: KEY, token: 'tok', signed_url: TOKEN.signedUrl })
    expect(storage.signedUploadToken).toHaveBeenCalledWith(ENV, KEY)
  })

  it('unknown document → 404', async () => {
    vi.mocked(docs.findSessionDocument).mockResolvedValue(null)
    const res = await send('POST', `/uploads/${DOC_ID}/token`, {})
    expect(res.status).toBe(404)
  })
})

describe('GET /items/:itemId/documents', () => {
  it('200 with the item and its listed documents only', async () => {
    vi.mocked(docs.findSessionItem).mockResolvedValue(item({ status: 'rejected', rejection_note: 'blurry' }))
    vi.mocked(docs.listItemDocuments).mockResolvedValue([
      doc({ status: 'ready', size_bytes: 10 }),
      doc({ id: '33333333-3333-4333-8333-333333333333', status: 'rejected', size_bytes: 20 }),
    ])
    const res = await send('GET', `/items/${ITEM_ID}/documents`)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = (await res.json()) as { item: unknown; documents: { status: string }[] }
    expect(body.item).toEqual({ id: ITEM_ID, label: 'Government ID', status: 'rejected', rejection_note: 'blurry' })
    expect(body.documents).toEqual([
      { id: DOC_ID, name: 'id.jpg', mime: 'image/jpeg', size_bytes: 10, status: 'ready', uploaded_at: '2026-10-11T08:00:00.000Z' },
      {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'id.jpg',
        mime: 'image/jpeg',
        size_bytes: 20,
        status: 'rejected',
        uploaded_at: '2026-10-11T08:00:00.000Z',
      },
    ])
    expect(body.documents.map((d) => d.status)).not.toContain('uploading')
    expect(body.documents.map((d) => d.status)).not.toContain('deleted')
  })

  it('item of another request → 404', async () => {
    vi.mocked(docs.findSessionItem).mockResolvedValue(null)
    const res = await send('GET', `/items/${ITEM_ID}/documents`)
    expect(res.status).toBe(404)
  })
})
