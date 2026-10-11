import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyStaffJwt } from '../auth/staff-jwt'
import { logEvent } from '../db/events'
import * as review from '../db/review'
import { ReviewError, type ReviewItem } from '../db/review'
import { getStaffProfile } from '../db/staff'
import { app } from '../index'
import { signedReadUrl } from '../storage/case-documents'

// Unit tests, no network: the JWT check and staff profile are mocked, so staffAuth itself stays real
// (a request with no Bearer token still gets its 401). db/review keeps its real ReviewError.
vi.mock('../auth/staff-jwt', () => ({ verifyStaffJwt: vi.fn() }))
vi.mock('../db/staff', () => ({ getStaffProfile: vi.fn() }))
vi.mock('../db/events', () => ({ logEvent: vi.fn() }))
vi.mock('../db/review', async (importOriginal) => {
  const real = await importOriginal<typeof import('../db/review')>()
  return {
    ReviewError: real.ReviewError,
    getFirmRequest: vi.fn(),
    listItemsWithDocuments: vi.fn(),
    getLatestClientSession: vi.fn(),
    findFirmDocument: vi.fn(),
    approveItem: vi.fn(),
    rejectItem: vi.fn(),
    listCaseEvents: vi.fn(),
  }
})
vi.mock('../storage/case-documents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../storage/case-documents')>()),
  signedReadUrl: vi.fn(),
}))

const ENV = { SUPABASE_URL: 'https://unit.supabase.test', SUPABASE_SECRET_KEY: 'unit' } as unknown as Env
const R1 = '11111111-1111-4111-8111-111111111111'
const D1 = '22222222-2222-4222-8222-222222222222'
const I1 = '33333333-3333-4333-8333-333333333333'

const REQUEST = {
  id: R1,
  firm_id: 'F1',
  case_id: 'C1',
  status: 'waiting_on_staff',
  sent_at: '2026-10-10T00:00:00Z',
  opened_at: null,
  completed_at: null,
  agent_display_name: 'Z',
  template_name: 'Standard',
}
const ITEMS: ReviewItem[] = [
  {
    id: I1,
    position: 1,
    kind: 'upload',
    label: 'Government ID',
    required: true,
    status: 'submitted',
    rejection_note: null,
    documents: [
      { id: 'd2', name: 'b.pdf', mime: 'application/pdf', size_bytes: 10, status: 'ready', uploaded_at: '2026-10-11T08:00:00Z', rejection_note: null },
      { id: 'd1', name: 'a.pdf', mime: 'application/pdf', size_bytes: 10, status: 'ready', uploaded_at: '2026-10-11T08:00:00Z', rejection_note: null },
    ],
  },
]
const doc = (over: Record<string, unknown> = {}) => ({
  id: D1,
  case_id: 'C1',
  request_item_id: I1,
  storage_key: `firm/F1/case/C1/item/${I1}/${D1}/id.jpg`,
  original_filename: 'My ID.jpg',
  mime_type: 'image/jpeg',
  size_bytes: 1024,
  sha256: null,
  status: 'ready',
  uploaded_at: '2026-10-11T08:00:00Z',
  rejection_note: null,
  firm_id: 'F1',
  request_id: R1,
  ...over,
})

const call = (method: string, path: string, body?: unknown, auth = true) => {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (auth) headers.authorization = 'Bearer unit-token'
  return app.request(`/api/admin${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, ENV)
}
const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.mocked(verifyStaffJwt).mockResolvedValue({ sub: 'U1', app_metadata: { firm_id: 'F1' } } as never)
  vi.mocked(getStaffProfile).mockResolvedValue({ user_id: 'U1', firm_id: 'F1', role: 'staff', display_name: 'Z' } as never)
  vi.mocked(review.getFirmRequest).mockResolvedValue(REQUEST)
  vi.mocked(review.listItemsWithDocuments).mockResolvedValue(ITEMS)
  vi.mocked(review.getLatestClientSession).mockResolvedValue({ last_step: 'upload', last_error: null, seen_at: '2026-10-11T08:01:00Z' })
  vi.mocked(review.findFirmDocument).mockResolvedValue(doc() as never)
  vi.mocked(review.approveItem).mockResolvedValue({ item_status: 'approved', request_status: 'complete' })
  vi.mocked(review.rejectItem).mockResolvedValue({ item_status: 'rejected', request_status: 'in_progress' })
  vi.mocked(signedReadUrl).mockResolvedValue('https://unit.supabase.test/storage/v1/object/sign/x?token=t')
  vi.mocked(logEvent).mockResolvedValue(7)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('GET /requests/:id/review', () => {
  it('returns the request, items with nested documents in the given order, and the client session', async () => {
    const res = await call('GET', `/requests/${R1}/review`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { request: unknown; items: ReviewItem[]; client_session: unknown }
    expect(body.request).toEqual(REQUEST)
    expect(body.items[0].documents.map((d) => d.id)).toEqual(['d2', 'd1'])
    expect(body.client_session).toEqual({ last_step: 'upload', last_error: null, seen_at: '2026-10-11T08:01:00Z' })
    expect(review.getFirmRequest).toHaveBeenCalledWith(ENV, 'F1', R1)
  })

  it('answers 404 not_found for another firm’s request or a malformed id', async () => {
    vi.mocked(review.getFirmRequest).mockResolvedValue(null)
    const res = await call('GET', `/requests/${R1}/review`)
    expect(res.status).toBe(404)
    expect(await code(res)).toBe('not_found')
    const bad = await call('GET', '/requests/R1/review')
    expect(bad.status).toBe(404)
  })

  it('answers 401 without a Bearer token', async () => {
    const res = await call('GET', `/requests/${R1}/review`, undefined, false)
    expect(res.status).toBe(401)
    expect(review.getFirmRequest).not.toHaveBeenCalled()
  })
})

describe('GET /documents/:id/url', () => {
  it('signs an inline URL for a photo for 300 s and logs document.viewed once', async () => {
    const res = await call('GET', `/documents/${D1}/url?disposition=inline`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ url: expect.stringContaining('token='), expires_in: 300, disposition: 'inline' })
    expect(signedReadUrl).toHaveBeenCalledWith(ENV, doc().storage_key, { download: false, expiresIn: 300 })
    expect(logEvent).toHaveBeenCalledTimes(1)
    expect(logEvent).toHaveBeenCalledWith(ENV, {
      firm_id: 'F1',
      case_id: 'C1',
      request_id: R1,
      actor_type: 'staff',
      actor_id: 'U1',
      action: 'document.viewed',
      payload: { document_id: D1, disposition: 'inline' },
    })
  })

  it('signs a download under the original file name', async () => {
    const res = await call('GET', `/documents/${D1}/url?disposition=attachment`)
    expect(res.status).toBe(200)
    expect(signedReadUrl).toHaveBeenCalledWith(ENV, doc().storage_key, { download: 'My ID.jpg', expiresIn: 300 })
  })

  it('downgrades inline to attachment for a type outside the accepted list', async () => {
    vi.mocked(review.findFirmDocument).mockResolvedValue(doc({ mime_type: 'application/octet-stream' }) as never)
    const res = await call('GET', `/documents/${D1}/url?disposition=inline`)
    expect(((await res.json()) as { disposition: string }).disposition).toBe('attachment')
  })

  it('rejects an unknown disposition with 400', async () => {
    const res = await call('GET', `/documents/${D1}/url?disposition=embed`)
    expect(res.status).toBe(400)
    expect(signedReadUrl).not.toHaveBeenCalled()
  })

  it('answers 404 for a document of another firm, and for one still uploading', async () => {
    vi.mocked(review.findFirmDocument).mockResolvedValue(null)
    expect((await call('GET', `/documents/${D1}/url`)).status).toBe(404)
    vi.mocked(review.findFirmDocument).mockResolvedValue(doc({ status: 'uploading' }) as never)
    expect((await call('GET', `/documents/${D1}/url`)).status).toBe(404)
    expect(logEvent).not.toHaveBeenCalled()
  })
})

describe('POST /items/:itemId/approve', () => {
  it('approves through the RPC and returns the recomputed request status', async () => {
    const res = await call('POST', `/items/${I1}/approve`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ item_status: 'approved', request_status: 'complete' })
    expect(review.approveItem).toHaveBeenCalledWith(ENV, 'F1', I1, 'U1')
  })

  it('maps item_not_submitted to a 409 envelope and not_found to 404', async () => {
    vi.mocked(review.approveItem).mockRejectedValueOnce(new ReviewError('item_not_submitted', 409))
    const res = await call('POST', `/items/${I1}/approve`)
    expect(res.status).toBe(409)
    expect(await code(res)).toBe('item_not_submitted')
    vi.mocked(review.approveItem).mockRejectedValueOnce(new ReviewError('not_found', 404))
    expect((await call('POST', `/items/${I1}/approve`)).status).toBe(404)
  })
})

describe('POST /items/:itemId/reject', () => {
  it('refuses a blank note with note_required without calling the RPC', async () => {
    const res = await call('POST', `/items/${I1}/reject`, { note: '  ' })
    expect(res.status).toBe(400)
    expect(await code(res)).toBe('note_required')
    expect(review.rejectItem).not.toHaveBeenCalled()
  })

  it('refuses a note over 500 characters', async () => {
    const res = await call('POST', `/items/${I1}/reject`, { note: 'x'.repeat(501) })
    expect(res.status).toBe(400)
    expect(review.rejectItem).not.toHaveBeenCalled()
  })

  it('rejects with the trimmed note', async () => {
    const res = await call('POST', `/items/${I1}/reject`, { note: ' blurry ' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ item_status: 'rejected', request_status: 'in_progress' })
    expect(review.rejectItem).toHaveBeenCalledWith(ENV, 'F1', I1, 'blurry', 'U1')
  })
})
