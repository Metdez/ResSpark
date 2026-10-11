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

// Mirrors CaseAddressView of app/worker/src/db/case-address.ts (Plan 06-03, D-07).
export interface CaseAddressView {
  line1: string
  line2: string | null
  city: string | null
  state_code: string | null
  zip5: string | null
  zip4: string | null
  county_name: string | null
  county_fips: string | null
  rdi: 'Residential' | 'Commercial' | null
  dpv: string | null
  verified: boolean
  source: 'smarty' | 'manual'
  confirmed_at: string
}

// Mirrors SignatureView of app/worker/src/db/signature-view.ts (Plan 06-07, D-20).
export type EsignStage = 'not_started' | 'waiting' | 'viewed' | 'signing' | 'signed' | 'declined' | 'expired' | 'error'

export interface SignatureView {
  item_id: string
  template_key: string | null
  configured: boolean
  connection: {
    id: string
    status: string
    stage: EsignStage
    env: 'test' | 'production'
    error_code: string | null
    completed_at: string | null
  } | null
}

export interface ReviewResponse {
  request: ReviewRequest
  items: ReviewItem[]
  client_session: ClientSessionView | null
  // Optional so a response from before Plan 06-03 still passes the guard; read it as `?? null`.
  address?: CaseAddressView | null
  // Optional for the same reason; read it as `?? []`.
  signatures?: SignatureView[]
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

const isAddress = (v: unknown): v is CaseAddressView =>
  isObject(v) &&
  str(v.line1) &&
  [v.line2, v.city, v.state_code, v.zip5, v.zip4, v.county_name, v.county_fips, v.dpv].every(strOrNull) &&
  (v.rdi === null || v.rdi === 'Residential' || v.rdi === 'Commercial') &&
  typeof v.verified === 'boolean' &&
  (v.source === 'smarty' || v.source === 'manual') &&
  str(v.confirmed_at)

const isSignature = (v: unknown): v is SignatureView =>
  isObject(v) &&
  str(v.item_id) &&
  strOrNull(v.template_key) &&
  typeof v.configured === 'boolean' &&
  (v.connection === null ||
    (isObject(v.connection) &&
      str(v.connection.id) &&
      str(v.connection.status) &&
      str(v.connection.stage) &&
      (v.connection.env === 'test' || v.connection.env === 'production') &&
      strOrNull(v.connection.error_code) &&
      strOrNull(v.connection.completed_at)))

export const isReviewResponse = (v: unknown): v is ReviewResponse =>
  isObject(v) &&
  isObject(v.request) &&
  str(v.request.id) &&
  str(v.request.case_id) &&
  str(v.request.status) &&
  strOrNull(v.request.opened_at) &&
  Array.isArray(v.items) &&
  v.items.every(isItem) &&
  (v.client_session === null || isSession(v.client_session)) &&
  (v.address === undefined || v.address === null || isAddress(v.address)) &&
  (v.signatures === undefined || (Array.isArray(v.signatures) && v.signatures.every(isSignature)))

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
