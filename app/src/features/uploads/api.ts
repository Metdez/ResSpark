import { portalFetch } from '@/features/client-portal/portal-api'

// Contracts of Plan 03-01's /api/c upload routes, mirrored. Every call goes through portalFetch
// (cookie session + X-Requested-With: ResSpark); the staff api() wrapper is never used on /c/*.
export interface MintResponse {
  document_id: string
  path: string
  token: string
  signed_url: string
}

export interface ItemDocument {
  id: string
  name: string
  mime: string
  size_bytes: number | null
  status: 'ready' | 'rejected'
  uploaded_at: string
}

export interface ItemDocuments {
  item: {
    id: string
    label: string
    status: string
    rejection_note: string | null
  }
  documents: ItemDocument[]
}

export interface CompleteResponse {
  document_status: string
  item_status: string
  request_status: string
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'

const isMintResponse = (v: unknown): v is MintResponse =>
  isObject(v) &&
  isStr(v.document_id) &&
  isStr(v.path) &&
  isStr(v.token) &&
  isStr(v.signed_url)

const isCompleteResponse = (v: unknown): v is CompleteResponse =>
  isObject(v) &&
  isStr(v.document_status) &&
  isStr(v.item_status) &&
  isStr(v.request_status)

const isDocument = (v: unknown): v is ItemDocument =>
  isObject(v) &&
  isStr(v.id) &&
  isStr(v.name) &&
  isStr(v.mime) &&
  (v.size_bytes === null || typeof v.size_bytes === 'number') &&
  (v.status === 'ready' || v.status === 'rejected') &&
  isStr(v.uploaded_at)

const isItemDocuments = (v: unknown): v is ItemDocuments =>
  isObject(v) &&
  isObject(v.item) &&
  isStr(v.item.id) &&
  isStr(v.item.label) &&
  isStr(v.item.status) &&
  (v.item.rejection_note === null || isStr(v.item.rejection_note)) &&
  Array.isArray(v.documents) &&
  v.documents.every(isDocument)

const post = (body?: unknown) => ({
  method: 'POST',
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})

export async function mintUpload(
  itemId: string,
  input: { name: string; mime: string; size: number }
): Promise<MintResponse> {
  return portalFetch(
    `/api/c/items/${itemId}/uploads`,
    post(input),
    isMintResponse
  )
}

export async function remintToken(documentId: string): Promise<MintResponse> {
  return portalFetch(
    `/api/c/uploads/${documentId}/token`,
    post(),
    isMintResponse
  )
}

export async function completeUpload(
  documentId: string,
  input: { sha256: string; size: number }
): Promise<CompleteResponse> {
  return portalFetch(
    `/api/c/uploads/${documentId}/complete`,
    post(input),
    isCompleteResponse
  )
}

export async function listItemDocuments(
  itemId: string
): Promise<ItemDocuments> {
  return portalFetch(`/api/c/items/${itemId}/documents`, {}, isItemDocuments)
}
