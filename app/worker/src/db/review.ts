import { createAdminClient } from './client'
import type { DocumentRow } from './documents'

type DbEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>

export interface ReviewRequest {
  id: string
  firm_id: string
  case_id: string
  status: string
  sent_at: string | null
  opened_at: string | null
  completed_at: string | null
  agent_display_name: string | null
  template_name: string
}

export interface ReviewDocument {
  id: string
  name: string
  mime: string
  size_bytes: number | null
  status: 'ready' | 'rejected'
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

export interface ClientSessionView {
  last_step: string | null
  last_error: string | null
  seen_at: string
}

export interface EventRow {
  id: number
  actor_type: 'staff' | 'client' | 'system' | 'provider'
  actor_id: string | null
  action: string
  payload: Record<string, unknown>
  created_at: string
  request_id: string | null
}

export class ReviewError extends Error {
  constructor(
    public code: string,
    public status: 400 | 404 | 409 | 500
  ) {
    super(code)
  }
}

const DOC_COLUMNS =
  'id, case_id, request_item_id, storage_key, original_filename, mime_type, size_bytes, sha256, status, uploaded_at, rejection_note'

export async function getFirmRequest(env: DbEnv, firmId: string, requestId: string): Promise<ReviewRequest | null> {
  const { data, error } = await createAdminClient(env)
    .from('requests')
    .select('id, firm_id, case_id, status, sent_at, opened_at, completed_at, agent_display_name, template_name')
    .eq('id', requestId)
    .eq('firm_id', firmId)
    .maybeSingle()
  if (error) throw new Error('request_lookup_failed')
  return data ?? null
}

type ItemWithDocs = Omit<ReviewItem, 'documents'> & {
  documents: (Omit<ReviewDocument, 'name' | 'mime'> & { original_filename: string; mime_type: string })[] | null
}

// The caller has already scoped requestId to the staff firm (getFirmRequest).
export async function listItemsWithDocuments(env: DbEnv, requestId: string): Promise<ReviewItem[]> {
  const { data, error } = await createAdminClient(env)
    .from('request_items')
    .select(
      'id, position, kind, label, required, status, rejection_note, documents(id, original_filename, mime_type, size_bytes, status, uploaded_at, rejection_note)'
    )
    .eq('request_id', requestId)
    .in('documents.status', ['ready', 'rejected'])
    .order('position', { ascending: true })
    .order('id', { ascending: true })
    .order('uploaded_at', { referencedTable: 'documents', ascending: true })
    .order('id', { referencedTable: 'documents', ascending: true })
  if (error) throw new Error('item_list_failed')
  return ((data ?? []) as ItemWithDocs[]).map(({ documents, ...item }) => ({
    ...item,
    documents: (documents ?? []).map(({ original_filename, mime_type, ...d }) => ({
      ...d,
      name: original_filename,
      mime: mime_type,
    })),
  }))
}

export async function getLatestClientSession(env: DbEnv, requestId: string): Promise<ClientSessionView | null> {
  const { data, error } = await createAdminClient(env)
    .from('client_sessions')
    .select('last_step, last_error, seen_at, client_links!inner(request_id)')
    .eq('client_links.request_id', requestId)
    .order('seen_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error('session_lookup_failed')
  if (!data) return null
  const { last_step, last_error, seen_at } = data as ClientSessionView
  return { last_step, last_error, seen_at }
}

// documents has no firm_id: it is scoped through request_items -> requests.firm_id.
export async function findFirmDocument(
  env: DbEnv,
  firmId: string,
  documentId: string
): Promise<(DocumentRow & { firm_id: string; request_id: string }) | null> {
  const { data, error } = await createAdminClient(env)
    .from('documents')
    .select(`${DOC_COLUMNS}, request_items!inner(request_id, requests!inner(firm_id))`)
    .eq('id', documentId)
    .eq('request_items.requests.firm_id', firmId)
    .maybeSingle()
  if (error) throw new Error('document_lookup_failed')
  if (!data) return null
  const { request_items: scope, ...row } = data as unknown as DocumentRow & {
    request_items: { request_id: string; requests: { firm_id: string } }
  }
  return { ...row, firm_id: scope.requests.firm_id, request_id: scope.request_id }
}

const RPC_ERRORS: Record<string, ReviewError['status']> = {
  item_not_found: 404,
  item_not_submitted: 409,
  note_required: 400,
}

// supabase-js surfaces a plpgsql RAISE as error.message; the Postgres text never leaves here.
function rpcError(error: { message?: string }): ReviewError {
  const words = (error.message ?? '').split(/\W+/)
  const token = Object.keys(RPC_ERRORS).find((t) => words.includes(t))
  if (!token) return new ReviewError('rpc_failed', 500)
  return new ReviewError(token === 'item_not_found' ? 'not_found' : token, RPC_ERRORS[token])
}

export async function approveItem(
  env: DbEnv,
  firmId: string,
  itemId: string,
  actorId: string
): Promise<{ item_status: string; request_status: string; already?: boolean }> {
  const { data, error } = await createAdminClient(env).rpc('item_approve', {
    p_item_id: itemId,
    p_firm_id: firmId,
    p_actor_id: actorId,
  })
  if (error) throw rpcError(error)
  return data
}

export async function rejectItem(
  env: DbEnv,
  firmId: string,
  itemId: string,
  note: string,
  actorId: string
): Promise<{ item_status: string; request_status: string }> {
  const { data, error } = await createAdminClient(env).rpc('item_reject', {
    p_item_id: itemId,
    p_firm_id: firmId,
    p_note: note,
    p_actor_id: actorId,
  })
  if (error) throw rpcError(error)
  return data
}

// null when the case is not this firm's, so the route answers 404 rather than an empty page.
// shortcut: the cursor is created_at only, so events sharing one timestamp across a page edge are skipped; add an id tiebreak if that shows up.
export async function listCaseEvents(
  env: DbEnv,
  firmId: string,
  caseId: string,
  before: string | null,
  limit: number
): Promise<EventRow[] | null> {
  const db = createAdminClient(env)
  const kase = await db.from('cases').select('id').eq('id', caseId).eq('firm_id', firmId).maybeSingle()
  if (kase.error) throw new Error('case_lookup_failed')
  if (!kase.data) return null
  let q = db
    .from('events')
    .select('id, actor_type, actor_id, action, payload, created_at, request_id')
    .eq('firm_id', firmId)
    .eq('case_id', caseId)
  if (before) q = q.lt('created_at', before)
  const { data, error } = await q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)
  if (error) throw new Error('event_list_failed')
  return (data ?? []) as EventRow[]
}
