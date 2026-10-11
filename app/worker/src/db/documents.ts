import { objectPath, type AcceptedMime } from '../storage/case-documents'
import { createAdminClient } from './client'

type DbEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>

export interface SessionCtx {
  link_id: string
  request_id: string
  firm_id: string
  case_id: string
}

export interface ItemRow {
  id: string
  request_id: string
  position: number
  kind: string
  label: string
  required: boolean
  status: string
  rejection_note: string | null
  config: Record<string, unknown> | null
}

export interface DocumentRow {
  id: string
  case_id: string
  request_item_id: string
  storage_key: string
  original_filename: string
  mime_type: AcceptedMime
  size_bytes: number | null
  sha256: string | null
  status: 'uploading' | 'ready' | 'rejected' | 'deleted'
  uploaded_at: string
  rejection_note: string | null
}

const ITEM_COLUMNS = 'id, request_id, position, kind, label, required, status, rejection_note, config'
const DOC_COLUMNS =
  'id, case_id, request_item_id, storage_key, original_filename, mime_type, size_bytes, sha256, status, uploaded_at, rejection_note'

// The cookie carries no case id; read the session's request once (case id and current status).
export async function sessionRequest(
  env: DbEnv,
  requestId: string,
  firmId: string
): Promise<{ case_id: string; status: string } | null> {
  const { data, error } = await createAdminClient(env)
    .from('requests')
    .select('case_id, status')
    .eq('id', requestId)
    .eq('firm_id', firmId)
    .maybeSingle()
  if (error) throw new Error('request_lookup_failed')
  return data ?? null
}

export async function findSessionItem(env: DbEnv, s: Pick<SessionCtx, 'request_id'>, itemId: string): Promise<ItemRow | null> {
  const { data, error } = await createAdminClient(env)
    .from('request_items')
    .select(ITEM_COLUMNS)
    .eq('id', itemId)
    .eq('request_id', s.request_id)
    .maybeSingle()
  if (error) throw new Error('item_lookup_failed')
  return data ?? null
}

export async function countActiveDocuments(env: DbEnv, itemId: string): Promise<number> {
  const { count, error } = await createAdminClient(env)
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('request_item_id', itemId)
    .in('status', ['uploading', 'ready'])
  if (error) throw new Error('document_count_failed')
  return count ?? 0
}

export async function createUploadingDocument(
  env: DbEnv,
  s: SessionCtx,
  item: ItemRow,
  input: { name: string; mime: AcceptedMime; size: number }
): Promise<DocumentRow> {
  const db = createAdminClient(env)
  const id = crypto.randomUUID()
  const code = item.config?.doc_code ?? item.config?.code
  const { data, error } = await db
    .from('documents')
    .insert({
      id,
      case_id: s.case_id,
      request_item_id: item.id,
      storage_key: objectPath({
        firm_id: s.firm_id,
        case_id: s.case_id,
        request_item_id: item.id,
        document_id: id,
        name: input.name,
      }),
      original_filename: input.name,
      mime_type: input.mime,
      document_type: typeof code === 'string' ? code : item.label,
      status: 'uploading',
      uploaded_by_actor: `client:${s.link_id}`,
    })
    .select(DOC_COLUMNS)
    .single()
  if (error) throw new Error('document_insert_failed')
  if (item.status === 'pending') {
    const { error: itemError } = await db
      .from('request_items')
      .update({ status: 'in_progress' })
      .eq('id', item.id)
      .eq('status', 'pending')
    if (itemError) throw new Error('item_update_failed')
  }
  return data as DocumentRow
}

// documents has no request_id: the inner join to request_items scopes it to the session's request.
export async function findSessionDocument(
  env: DbEnv,
  s: Pick<SessionCtx, 'request_id'>,
  documentId: string
): Promise<DocumentRow | null> {
  const { data, error } = await createAdminClient(env)
    .from('documents')
    .select(`${DOC_COLUMNS}, request_items!inner(request_id)`)
    .eq('id', documentId)
    .eq('request_items.request_id', s.request_id)
    .maybeSingle()
  if (error) throw new Error('document_lookup_failed')
  if (!data) return null
  const { request_items: _scope, ...row } = data as DocumentRow & { request_items: unknown }
  return row
}

export async function listItemDocuments(env: DbEnv, itemId: string): Promise<DocumentRow[]> {
  const { data, error } = await createAdminClient(env)
    .from('documents')
    .select(DOC_COLUMNS)
    .eq('request_item_id', itemId)
    .in('status', ['ready', 'rejected'])
    .order('uploaded_at', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw new Error('document_list_failed')
  return (data ?? []) as DocumentRow[]
}

export async function markDocumentDeleted(env: DbEnv, documentId: string): Promise<void> {
  const { error } = await createAdminClient(env).from('documents').update({ status: 'deleted' }).eq('id', documentId)
  if (error) throw new Error('document_update_failed')
}

export async function completeUpload(
  env: DbEnv,
  s: Pick<SessionCtx, 'request_id' | 'link_id'>,
  documentId: string,
  size: number,
  sha256: string
): Promise<{ document_status: string; item_status: string; request_status: string; already?: boolean }> {
  const { data, error } = await createAdminClient(env).rpc('upload_complete', {
    p_document_id: documentId,
    p_request_id: s.request_id,
    p_size_bytes: size,
    p_sha256: sha256,
    p_actor_id: `client:${s.link_id}`,
  })
  if (error) {
    const words = (error.message ?? '').split(/\W+/)
    throw new Error(['document_not_found', 'document_not_uploading'].find((t) => words.includes(t)) ?? 'complete_failed')
  }
  return data
}
