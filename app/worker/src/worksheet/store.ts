// Loads one run with its confirmed-value sources, renders the worksheet once and files it as a case
// document (D-16). Idempotent on storage_key (RESEARCH Pitfall 11). Database messages never leave here.
import { createAdminClient } from '../db/client'
import { logEvent } from '../db/events'
import { getStandardsVersion, staffDisplayNames } from '../financials/db'
import { toRunView } from '../financials/evaluate'
import { BUCKET } from '../storage/case-documents'
import type { WorksheetInput } from './layout'
import { renderWorksheet } from './render'

type DbEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>

export const WORKSHEET_TYPE = 'worksheet_433a'

const worksheetPath = (firmId: string, caseId: string, runId: string) => `firm/${firmId}/case/${caseId}/worksheets/${runId}.pdf`

async function getRun(env: DbEnv, p: { firmId: string; caseId: string; runId: string }): Promise<Record<string, unknown> | null> {
  const { data, error } = await createAdminClient(env)
    .from('determination_runs')
    .select('*')
    .eq('id', p.runId)
    .eq('case_id', p.caseId)
    .eq('firm_id', p.firmId)
    .maybeSingle()
  if (error) throw new Error('run_lookup_failed')
  return data
}

// The case's most recent request that is still live; the push card of that request lists the worksheets.
async function latestRequestId(env: DbEnv, firmId: string, caseId: string): Promise<string | null> {
  const { data, error } = await createAdminClient(env)
    .from('requests')
    .select('id')
    .eq('firm_id', firmId)
    .eq('case_id', caseId)
    .neq('status', 'revoked')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error('request_lookup_failed')
  return (data?.id as string | undefined) ?? null
}

export async function loadWorksheetInput(
  env: DbEnv,
  p: { firmId: string; caseId: string; runId: string }
): Promise<WorksheetInput | null> {
  const run = await getRun(env, p)
  if (!run) return null
  const db = createAdminClient(env)
  const [kase, firm, decided, standards] = await Promise.all([
    db.from('cases').select('first_name, last_name, logics_case_id').eq('firm_id', p.firmId).eq('id', p.caseId).maybeSingle(),
    db.from('firms').select('name').eq('id', p.firmId).maybeSingle(),
    // Confirmed values only: the decision in force when the run was made, never an open proposal (D-16).
    db
      .from('financial_proposals')
      .select('canonical_column, source, status, decided_by, decided_at')
      .eq('firm_id', p.firmId)
      .eq('case_id', p.caseId)
      .in('status', ['accepted', 'edited'])
      .lte('decided_at', run.created_at as string)
      .order('decided_at', { ascending: false }),
    getStandardsVersion(env),
  ])
  if (kase.error || firm.error || decided.error) throw new Error('worksheet_lookup_failed')
  if (!kase.data) return null
  const rows = (decided.data ?? []) as Array<{ canonical_column: string; source: string; status: 'accepted' | 'edited'; decided_by: string | null }>
  const createdBy = (run.created_by as string | null) ?? null
  const names = await staffDisplayNames(env, p.firmId, [...new Set([...rows.map((r) => r.decided_by), createdBy].filter((x): x is string => !!x))])
  const sources: WorksheetInput['sources'] = {}
  for (const r of rows) {
    if (sources[r.canonical_column]) continue
    sources[r.canonical_column] = { source: r.source, status: r.status, by_name: r.decided_by ? (names[r.decided_by] ?? null) : null }
  }
  const name = [kase.data.first_name, kase.data.last_name].filter(Boolean).join(' ')
  return {
    firm_name: (firm.data?.name as string | undefined) ?? 'Unknown firm',
    client_name: name || 'Unnamed client',
    logics_case_id: (kase.data.logics_case_id as number | null) ?? null,
    run: toRunView(run, createdBy ? (names[createdBy] ?? null) : null),
    snapshot: (run.financial_data_snapshot ?? {}) as Record<string, unknown>,
    sources,
    standards: { effective_date: standards?.effective_date ?? null, source_url: standards?.source_url ?? null },
    generated_at: new Date().toISOString(),
  }
}

type ExportResult = { document_id: string; file_name: string; pages: number; request_id: string | null; already: boolean }

async function existingDocument(env: DbEnv, caseId: string, path: string) {
  const { data, error } = await createAdminClient(env)
    .from('documents')
    .select('id, original_filename, status')
    .eq('case_id', caseId)
    .eq('storage_key', path)
    .maybeSingle()
  if (error) throw new Error('document_lookup_failed')
  return data as { id: string; original_filename: string; status: string } | null
}

async function pagesOf(env: DbEnv, caseId: string, documentId: string): Promise<number> {
  const { data, error } = await createAdminClient(env)
    .from('events')
    .select('payload')
    .eq('case_id', caseId)
    .eq('action', 'worksheet.generated')
    .eq('payload->>document_id', documentId)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error('event_lookup_failed')
  return Number((data?.payload as { pages?: unknown } | undefined)?.pages ?? 0)
}

async function already(env: DbEnv, p: { firmId: string; caseId: string }, doc: { id: string; original_filename: string; status: string }): Promise<ExportResult> {
  if (doc.status === 'uploading') throw new Error('worksheet_in_progress')
  return {
    document_id: doc.id,
    file_name: doc.original_filename,
    pages: await pagesOf(env, p.caseId, doc.id),
    request_id: await latestRequestId(env, p.firmId, p.caseId),
    already: true,
  }
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

export async function exportWorksheet(
  env: DbEnv,
  p: { firmId: string; caseId: string; runId: string; actorId: string }
): Promise<ExportResult | null> {
  const path = worksheetPath(p.firmId, p.caseId, p.runId)
  if (!(await getRun(env, p))) return null
  const found = await existingDocument(env, p.caseId, path)
  if (found) return already(env, p, found)

  const input = await loadWorksheetInput(env, p)
  if (!input) return null
  const fileName = `433A-screening-worksheet-${input.logics_case_id ?? p.caseId}-${input.run.created_at.slice(0, 10)}.pdf`
  const db = createAdminClient(env)
  const id = crypto.randomUUID()
  // The row comes first: storage_key is UNIQUE, so a concurrent export loses here, not in Storage.
  const inserted = await db.from('documents').insert({
    id,
    case_id: p.caseId,
    request_item_id: null,
    storage_key: path,
    original_filename: fileName,
    mime_type: 'application/pdf',
    document_type: WORKSHEET_TYPE,
    status: 'uploading',
    uploaded_by_actor: `staff:${p.actorId}`,
  })
  if (inserted.error) {
    const winner = inserted.error.code === '23505' ? await existingDocument(env, p.caseId, path) : null
    if (winner) return already(env, p, winner)
    throw new Error('document_insert_failed')
  }

  try {
    const { bytes, pages } = await renderWorksheet(input)
    const up = await db.storage.from(BUCKET).upload(path, bytes, { contentType: 'application/pdf', upsert: false })
    if (up.error) throw new Error('storage_upload_failed')
    const sha256 = hex(await crypto.subtle.digest('SHA-256', bytes))
    const ready = await db
      .from('documents')
      .update({ status: 'ready', size_bytes: bytes.byteLength, sha256 })
      .eq('id', id)
      .eq('status', 'uploading')
    if (ready.error) throw new Error('document_update_failed')
    await logEvent(env, {
      firm_id: p.firmId,
      case_id: p.caseId,
      actor_type: 'staff',
      actor_id: p.actorId,
      action: 'worksheet.generated',
      payload: { run_id: p.runId, document_id: id, pages },
    })
    return { document_id: id, file_name: fileName, pages, request_id: await latestRequestId(env, p.firmId, p.caseId), already: false }
  } catch (e) {
    // A failed export leaves nothing behind, so the next click starts clean.
    await db.storage.from(BUCKET).remove([path])
    await db.from('documents').delete().eq('id', id).eq('status', 'uploading')
    throw e
  }
}

export async function listCaseWorksheets(
  env: DbEnv,
  firmId: string,
  caseId: string
): Promise<{
  request_id: string | null
  worksheets: Array<{ id: string; file_name: string; size_bytes: number | null; sha256: string | null; created_at: string; run_id: string }>
} | null> {
  const db = createAdminClient(env)
  const kase = await db.from('cases').select('id').eq('firm_id', firmId).eq('id', caseId).maybeSingle()
  if (kase.error) throw new Error('case_lookup_failed')
  if (!kase.data) return null
  const { data, error } = await db
    .from('documents')
    .select('id, original_filename, size_bytes, sha256, uploaded_at, storage_key')
    .eq('case_id', caseId)
    .eq('document_type', WORKSHEET_TYPE)
    .eq('status', 'ready')
    .is('request_item_id', null)
    .order('uploaded_at', { ascending: false })
  if (error) throw new Error('documents_read_failed')
  return {
    request_id: await latestRequestId(env, firmId, caseId),
    worksheets: (data ?? []).map((d) => ({
      id: d.id as string,
      file_name: d.original_filename as string,
      size_bytes: d.size_bytes === null ? null : Number(d.size_bytes),
      sha256: d.sha256 as string | null,
      created_at: d.uploaded_at as string,
      run_id: ((d.storage_key as string).split('/').pop() ?? '').replace(/\.pdf$/, ''),
    })),
  }
}
