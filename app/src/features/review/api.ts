import { api, isObject } from '@/lib/api'

// Contracts of app/worker/src/routes/admin-review.ts (snake_case JSON, mirrored, not imported).
export const REJECT_PRESETS = ['blurry', 'wrong document', 'missing pages', 'need all pages'] as const

export type Disposition = 'inline' | 'attachment'

export interface ReviewDocument {
  id: string
  name: string
  mime: string
  size_bytes: number | null
  status: string
  uploaded_at: string
  rejection_note: string | null
}

export interface ReviewItem {
  id: string
  position: number
  kind: string
  label: string
  required: boolean
  status: string
  rejection_note: string | null
  documents: ReviewDocument[]
}

export interface ReviewRequest {
  id: string
  case_id: string
  status: string
  opened_at: string | null
}

export interface ClientSessionView {
  last_step: string | null
  last_error: string | null
  seen_at: string
}

export interface ReviewResponse {
  request: ReviewRequest
  items: ReviewItem[]
  client_session: ClientSessionView | null
}

export interface DecisionResponse {
  item_status: string
  request_status: string
}

const str = (v: unknown) => typeof v === 'string'
const strOrNull = (v: unknown) => v === null || typeof v === 'string'

const isDocument = (v: unknown): v is ReviewDocument =>
  isObject(v) &&
  str(v.id) &&
  str(v.name) &&
  str(v.mime) &&
  (v.size_bytes === null || typeof v.size_bytes === 'number') &&
  str(v.status) &&
  str(v.uploaded_at) &&
  strOrNull(v.rejection_note)

const isItem = (v: unknown): v is ReviewItem =>
  isObject(v) &&
  str(v.id) &&
  typeof v.position === 'number' &&
  str(v.kind) &&
  str(v.label) &&
  typeof v.required === 'boolean' &&
  str(v.status) &&
  strOrNull(v.rejection_note) &&
  Array.isArray(v.documents) &&
  v.documents.every(isDocument)

const isSession = (v: unknown): v is ClientSessionView =>
  isObject(v) && strOrNull(v.last_step) && strOrNull(v.last_error) && str(v.seen_at)

export const isReviewResponse = (v: unknown): v is ReviewResponse =>
  isObject(v) &&
  isObject(v.request) &&
  str(v.request.id) &&
  str(v.request.case_id) &&
  str(v.request.status) &&
  strOrNull(v.request.opened_at) &&
  Array.isArray(v.items) &&
  v.items.every(isItem) &&
  (v.client_session === null || isSession(v.client_session))

export const isUrlResponse = (v: unknown): v is { url: string; expires_in: number; disposition: Disposition } =>
  isObject(v) &&
  str(v.url) &&
  typeof v.expires_in === 'number' &&
  (v.disposition === 'inline' || v.disposition === 'attachment')

export const isDecisionResponse = (v: unknown): v is DecisionResponse =>
  isObject(v) && str(v.item_status) && str(v.request_status)

const id = encodeURIComponent

export const fetchReview = (requestId: string) =>
  api(`/api/admin/requests/${id(requestId)}/review`, {}, isReviewResponse)

export const documentUrl = (documentId: string, disposition: Disposition) =>
  api(`/api/admin/documents/${id(documentId)}/url?disposition=${disposition}`, {}, isUrlResponse)

export const approve = (itemId: string) =>
  api(`/api/admin/items/${id(itemId)}/approve`, { method: 'POST' }, isDecisionResponse)

export const reject = (itemId: string, note: string) =>
  api(`/api/admin/items/${id(itemId)}/reject`, { method: 'POST', body: JSON.stringify({ note }) }, isDecisionResponse)
