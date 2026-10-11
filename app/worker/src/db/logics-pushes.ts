import { createAdminClient } from './client'

type DbEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>

export type PushState = 'queued' | 'sending' | 'sent' | 'failed' | 'unknown'
export type PushMode = 'fake' | 'live'

export interface PushRow {
  id: string
  batch_id: string
  firm_id: string
  case_id: string
  request_id: string
  document_id: string
  part_index: number
  part_count: number | null
  file_name: string
  part_storage_path: string | null
  part_bytes: number | null
  part_sha256: string | null
  file_category_id: number | null
  state: PushState
  mode: PushMode
  needs_manual_compression: boolean
  logics_document_id: number | null
  request_fingerprint: string
  error_code: string | null
  error_detail: string | null
  attempts: number
  claimed_at: string | null
  sent_at: string | null
  resolved_by: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface BatchRow {
  id: string
  firm_id: string
  case_id: string
  request_id: string
  logics_case_id: number
  created_by: string
  agent_display_name: string
  mode: PushMode
  file_category_id: number | null
  activity_type: string
  activity_state: 'pending' | 'sending' | 'sent' | 'failed' | 'unknown' | 'skipped'
  logics_activity_id: number | null
  activity_error: string | null
  created_at: string
  updated_at: string
}

export interface FinalizePart {
  file_name: string
  part_index: number
  part_count: number | null
  document_id: string
}

export type PushJob = PushRow & {
  logics_case_id: number
  agent_display_name: string
  activity_type: string
  storage_key: string
  source_sha256: string | null
  source_mime: string
  source_bytes: number | null
}

// RAISE tokens of migration 0006; Postgres text never leaves this module.
const PUSH_TOKENS = [
  'no_items',
  'not_pushable',
  'already_pushed',
  'request_not_found',
  'not_found',
  'not_resolvable',
  'bad_action',
  'not_sending',
  'logics_pushes_sent_has_id',
] as const

function pushError(error: { message?: string; code?: string }, fallback: string): Error {
  // 23505 = logics_pushes_fingerprint_live: the part is already live (queued/sending/sent).
  if (error.code === '23505') return new Error('already_pushed')
  const words = (error.message ?? '').split(/\W+/)
  return new Error(PUSH_TOKENS.find((t) => words.includes(t)) ?? fallback)
}

export async function fingerprintHex(caseId: string, sha256: string, partIndex: number): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${caseId}|${sha256}|${partIndex}`))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Firm-scoped first (Pattern 2): another firm's request reads as null.
export async function getFirmRequestCase(
  env: DbEnv,
  firmId: string,
  requestId: string
): Promise<{ id: string; case_id: string; logics_case_id: number | null } | null> {
  const { data, error } = await createAdminClient(env)
    .from('requests')
    .select('id, case_id, cases!inner(logics_case_id)')
    .eq('firm_id', firmId)
    .eq('id', requestId)
    .maybeSingle()
  if (error) throw new Error('request_lookup_failed')
  if (!data) return null
  const kase = data.cases as unknown as { logics_case_id: number | null }
  return { id: data.id as string, case_id: data.case_id as string, logics_case_id: kase.logics_case_id }
}

export async function listPushableDocuments(
  env: DbEnv,
  firmId: string,
  requestId: string
): Promise<
  Array<{
    id: string
    original_filename: string
    mime_type: string
    size_bytes: number | null
    sha256: string | null
    item_label: string
    item_status: string
    status: string
  }>
> {
  const { data, error } = await createAdminClient(env)
    .from('documents')
    .select('id, original_filename, mime_type, size_bytes, sha256, status, request_items!inner(label, status, request_id, requests!inner(firm_id))')
    .eq('status', 'ready')
    .eq('request_items.request_id', requestId)
    .eq('request_items.requests.firm_id', firmId)
  if (error) throw new Error('documents_read_failed')
  return (data ?? []).map((d) => {
    const item = d.request_items as unknown as { label: string; status: string }
    return {
      id: d.id as string,
      original_filename: d.original_filename as string,
      mime_type: d.mime_type as string,
      size_bytes: d.size_bytes === null ? null : Number(d.size_bytes),
      sha256: d.sha256 as string | null,
      item_label: item.label,
      item_status: item.status,
      status: d.status as string,
    }
  })
}

export async function createBatch(
  env: DbEnv,
  input: {
    firmId: string
    requestId: string
    actorId: string
    agentDisplayName: string
    mode: PushMode
    fileCategoryId: number | null
    activityType: string
    items: Array<{ documentId: string; fingerprint: string; fileName: string }>
    pushAgain: string[]
  }
): Promise<{ batchId: string; pushIds: string[] }> {
  const { data, error } = await createAdminClient(env).rpc('logics_push_create_batch', {
    p_firm_id: input.firmId,
    p_request_id: input.requestId,
    p_actor_id: input.actorId,
    p_agent_display_name: input.agentDisplayName,
    p_mode: input.mode,
    p_file_category_id: input.fileCategoryId,
    p_activity_type: input.activityType,
    p_items: input.items.map((i) => ({ document_id: i.documentId, fingerprint: i.fingerprint, file_name: i.fileName })),
    p_push_again: input.pushAgain,
  })
  if (error) throw pushError(error, 'push_create_failed')
  const out = data as { batch_id: string; push_ids: string[] }
  return { batchId: out.batch_id, pushIds: out.push_ids }
}

// Ids only (the consumer has no staff context); the row's own firm_id scopes everything downstream.
export async function getPushForJob(env: DbEnv, pushId: string): Promise<PushJob | null> {
  const { data, error } = await createAdminClient(env)
    .from('logics_pushes')
    .select(
      '*, logics_push_batches!inner(logics_case_id, agent_display_name, activity_type), documents!inner(storage_key, sha256, mime_type, size_bytes)'
    )
    .eq('id', pushId)
    .maybeSingle()
  if (error) throw new Error('push_read_failed')
  if (!data) return null
  const { logics_push_batches: b, documents: d, ...row } = data as Record<string, unknown>
  const batch = b as { logics_case_id: number; agent_display_name: string; activity_type: string }
  const doc = d as { storage_key: string; sha256: string | null; mime_type: string; size_bytes: number | null }
  return {
    ...(row as unknown as PushRow),
    logics_case_id: Number(batch.logics_case_id),
    agent_display_name: batch.agent_display_name,
    activity_type: batch.activity_type,
    storage_key: doc.storage_key,
    source_sha256: doc.sha256,
    source_mime: doc.mime_type,
    source_bytes: doc.size_bytes === null ? null : Number(doc.size_bytes),
  }
}

// null when refused: not queued, or a sibling of the same case is sending (D-02).
export async function claimPush(env: DbEnv, pushId: string): Promise<PushRow | null> {
  const { data, error } = await createAdminClient(env).rpc('logics_push_claim', { p_push_id: pushId })
  if (error) throw new Error('push_claim_failed')
  const row = data as PushRow | null
  return row && row.id ? row : null
}

export async function transitionPush(
  env: DbEnv,
  p: {
    pushId: string
    from: PushState
    to: PushState
    logicsDocumentId?: number | null
    errorCode?: string | null
    errorDetail?: string | null
    needsManual?: boolean
    actorId?: string | null
  }
): Promise<boolean> {
  const { data, error } = await createAdminClient(env).rpc('logics_push_transition', {
    p_push_id: p.pushId,
    p_from: p.from,
    p_to: p.to,
    p_logics_document_id: p.logicsDocumentId ?? null,
    p_error_code: p.errorCode ?? null,
    p_error_detail: p.errorDetail ?? null,
    p_needs_manual: p.needsManual ?? null,
    p_actor_id: p.actorId ?? null,
  })
  if (error) throw pushError(error, 'push_transition_failed')
  return data === true
}

// Plan 03 normalization seam: records part 0's bytes and queues sibling parts.
export async function addParts(
  env: DbEnv,
  p: {
    pushId: string
    partCount: number
    parts: Array<{ partIndex: number; fingerprint: string; fileName: string; storagePath: string; bytes: number; sha256: string }>
  }
): Promise<string[]> {
  const { data, error } = await createAdminClient(env).rpc('logics_push_add_parts', {
    p_push_id: p.pushId,
    p_part_count: p.partCount,
    p_parts: p.parts.map((x) => ({
      part_index: x.partIndex,
      fingerprint: x.fingerprint,
      file_name: x.fileName,
      storage_path: x.storagePath,
      bytes: x.bytes,
      sha256: x.sha256,
    })),
  })
  if (error) throw pushError(error, 'push_add_parts_failed')
  return (data as string[] | null) ?? []
}

// null unless this caller won the pending -> sending flip (exactly once per batch, PUSH-03).
export async function finalizeBatch(
  env: DbEnv,
  batchId: string
): Promise<{ batch: BatchRow; sent: FinalizePart[]; unknown: FinalizePart[]; all_failed: boolean } | null> {
  const { data, error } = await createAdminClient(env).rpc('logics_push_finalize_batch', { p_batch_id: batchId })
  if (error) throw new Error('push_finalize_failed')
  return (data as { batch: BatchRow; sent: FinalizePart[]; unknown: FinalizePart[]; all_failed: boolean } | null) ?? null
}

export async function recordBatchActivity(
  env: DbEnv,
  p: { batchId: string; state: 'sent' | 'failed' | 'unknown' | 'skipped'; activityId?: number | null; error?: string | null }
): Promise<void> {
  const { error } = await createAdminClient(env).rpc('logics_push_batch_activity', {
    p_batch_id: p.batchId,
    p_state: p.state,
    p_activity_id: p.activityId ?? null,
    p_error: p.error ?? null,
  })
  if (error) throw new Error('push_activity_failed')
}

export async function resolvePush(
  env: DbEnv,
  p: { pushId: string; firmId: string; action: 'mark_sent' | 'resend'; actorId: string; logicsDocumentId?: number | null }
): Promise<{ state: PushState; new_push_id: string | null }> {
  const { data, error } = await createAdminClient(env).rpc('logics_push_resolve', {
    p_push_id: p.pushId,
    p_firm_id: p.firmId,
    p_action: p.action,
    p_actor_id: p.actorId,
    p_logics_document_id: p.logicsDocumentId ?? null,
  })
  if (error) throw pushError(error, 'push_resolve_failed')
  return data as { state: PushState; new_push_id: string | null }
}

// Batches newest first; parts within a batch oldest first with an id tiebreak (PUSH-01 ordering).
export async function listLedger(
  env: DbEnv,
  firmId: string,
  requestId: string
): Promise<{ batches: Array<BatchRow & { pushes: PushRow[] }> }> {
  const db = createAdminClient(env)
  const [batches, pushes] = await Promise.all([
    db
      .from('logics_push_batches')
      .select('*')
      .eq('firm_id', firmId)
      .eq('request_id', requestId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false }),
    db
      .from('logics_pushes')
      .select('*')
      .eq('firm_id', firmId)
      .eq('request_id', requestId)
      .order('created_at')
      .order('part_index')
      .order('id'),
  ])
  if (batches.error || pushes.error) throw new Error('ledger_read_failed')
  const byBatch = new Map<string, PushRow[]>()
  for (const p of pushes.data as PushRow[]) byBatch.set(p.batch_id, [...(byBatch.get(p.batch_id) ?? []), p])
  return { batches: (batches.data as BatchRow[]).map((b) => ({ ...b, pushes: byBatch.get(b.id) ?? [] })) }
}
