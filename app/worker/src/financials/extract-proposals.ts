// D-17 / FORM-03: the case's uploaded PDFs -> ported regex extractors -> document-source proposals.
// No LLM and no network beyond Supabase. Errors become fixed reason codes; document text never leaves here (D-20).
import { createAdminClient } from '../db/client'
import { logEvent } from '../db/events'
import { ExtractError, parsePdf, type ParsedDocument } from '../extract/parse'
import { mergeDocuments } from '../extract/merge'
import { BUCKET } from '../storage/case-documents'
import { lineFor } from './lines'
import { upsertProposals, type ProposalInput, type SourceRef } from './rpc'

type DbEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>

export const MAX_DOCUMENTS = 25 // T-07-48
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024 // T-07-48

export type FailReason = 'no_template' | 'missing_fields' | 'unreadable'
export type SkipReason = 'too_large' | 'not_pdf'
export interface ExtractResult {
  documents: number
  parsed: number
  failed: Array<{ document_id: string; name: string; reason: FailReason }>
  skipped: Array<{ document_id: string; name: string; reason: SkipReason }>
  proposals: { inserted: number; kept: number; superseded: number }
}

// The county comes only from a confirmed address (D-12); the state travels with it.
const NEVER = new Set(['state_of_residence', 'county_of_residence'])
const cents = (v: number) => Math.round(v * 100) / 100

export function failReason(error: unknown): FailReason {
  if (!(error instanceof ExtractError)) return 'unreadable'
  const m = error.message
  if (m.startsWith('No template matched')) return 'no_template'
  if (m.startsWith('Missing') || m.startsWith('No amount') || m.startsWith('No dollar amount')) return 'missing_fields'
  return 'unreadable'
}

export function mergedRowToProposals(merged: Record<string, unknown>, refs: Array<{ id: string; name: string }>): ProposalInput[] {
  const source_refs: SourceRef[] = refs.map((r) => ({ kind: 'document', id: r.id, label: r.name }))
  const out: ProposalInput[] = []
  for (const [column, raw] of Object.entries(merged)) {
    const line = lineFor(column)
    if (!line || NEVER.has(column)) continue
    let value: ProposalInput['proposed_value'] | null = null
    if (line.kind === 'money' && typeof raw === 'number' && Number.isFinite(raw)) value = cents(raw)
    else if (line.kind === 'money_list' && Array.isArray(raw) && raw.every((x) => typeof x === 'number' && Number.isFinite(x)))
      value = (raw as number[]).map(cents)
    else if (line.kind === 'count' && Number.isInteger(raw)) value = raw as number
    else if (line.kind === 'bool' && typeof raw === 'boolean') value = raw
    else if (line.kind === 'text' && typeof raw === 'string') value = raw
    if (value === null) continue
    out.push({ canonical_column: column, proposed_value: value, source_refs, method: 'regex_extract', window_start: null, window_end: null, reliability: 'B' })
  }
  return out
}

interface DocRow {
  id: string
  original_filename: string
  mime_type: string
  document_type: string | null
  size_bytes: number | null
  storage_key: string
}

export async function extractCaseDocuments(
  env: DbEnv,
  p: { firmId: string; caseId: string; actorId: string }
): Promise<ExtractResult | null> {
  const db = createAdminClient(env)
  // T-07-49: the case is read firm-scoped; its documents are selected by that case id only.
  const found = await db.from('cases').select('id').eq('firm_id', p.firmId).eq('id', p.caseId).maybeSingle()
  if (found.error) throw new Error('case_lookup_failed')
  if (!found.data) return null
  const docs = await db
    .from('documents')
    .select('id, original_filename, mime_type, document_type, size_bytes, storage_key')
    .eq('case_id', p.caseId)
    .eq('status', 'ready')
    .or('document_type.is.null,document_type.neq.worksheet_433a')
    .order('uploaded_at', { ascending: false })
    .limit(MAX_DOCUMENTS)
  if (docs.error) throw new Error('document_lookup_failed')
  const rows = docs.data as DocRow[]

  const parts: ParsedDocument[] = []
  const refs: Array<{ id: string; name: string }> = []
  const failed: ExtractResult['failed'] = []
  const skipped: ExtractResult['skipped'] = []
  // Sequential on purpose: one PDF in memory at a time (T-07-48).
  for (const doc of rows) {
    const entry = { document_id: doc.id, name: doc.original_filename }
    if (doc.mime_type !== 'application/pdf') {
      skipped.push({ ...entry, reason: 'not_pdf' })
      continue
    }
    if ((doc.size_bytes ?? 0) > MAX_DOCUMENT_BYTES) {
      skipped.push({ ...entry, reason: 'too_large' })
      continue
    }
    const file = await db.storage.from(BUCKET).download(doc.storage_key)
    if (file.error || !file.data) {
      failed.push({ ...entry, reason: 'unreadable' })
      continue
    }
    // size_bytes can be null on old rows; the object itself is the last word.
    if (file.data.size > MAX_DOCUMENT_BYTES) {
      skipped.push({ ...entry, reason: 'too_large' })
      continue
    }
    try {
      parts.push(await parsePdf(new Uint8Array(await file.data.arrayBuffer()), doc.document_type))
      refs.push({ id: doc.id, name: doc.original_filename })
    } catch (error) {
      failed.push({ ...entry, reason: failReason(error) })
    }
  }

  // An empty list still runs, so document proposals from files that no longer parse are superseded (D-07).
  const proposals = parts.length ? mergedRowToProposals(mergeDocuments(parts), refs) : []
  const counts = await upsertProposals(env, {
    firmId: p.firmId,
    caseId: p.caseId,
    source: 'document',
    generatorVersion: 'extract-1',
    proposals,
    scopeColumns: null,
    actor: { type: 'staff', id: p.actorId },
  })
  await logEvent(env, {
    firm_id: p.firmId,
    case_id: p.caseId,
    actor_type: 'staff',
    actor_id: p.actorId,
    action: 'financials.extracted',
    payload: { documents: rows.length, parsed: parts.length, failed: failed.length, skipped: skipped.length },
  })
  return { documents: rows.length, parsed: parts.length, failed, skipped, proposals: counts }
}
