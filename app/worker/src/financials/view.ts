// Pure assembly of the staff 433-A view (D-14): every line, its status and competing proposals.
import { isApplicable } from '../../../shared/questions'
import { missingFinancialColumns, missingQuestionIds } from '../engine/intake-workflow'
import type { CountyBlock } from './county'
import type { CaseEmployer, FinancialsCase, ProposalRow } from './db'
import { LINES, type LineMeta, SECTIONS, type SectionId } from './lines'
import { completeMonthsWindow } from './propose/window'

export interface ProposalView {
  id: string
  source: string
  proposed_value: unknown
  method: string
  window_start: string | null
  window_end: string | null
  reliability: 'A' | 'B' | 'C'
  source_refs: Array<{ kind: string; id: string; label: string }>
  created_at: string
}

export type LineStatus = 'needs_data' | 'proposed' | 'confirmed' | 'edited' | 'standard'

export interface LineView extends LineMeta {
  value: unknown
  status: LineStatus
  confirmed: { proposal_id: string | null; source: string | null; by_name: string | null; at: string | null } | null
  proposals: ProposalView[]
}

export interface FinancialsView {
  case: { id: string; logics_case_id: number | null; first_name: string | null; last_name: string | null }
  settings: { window_months: 3 | 6; spouse_employer_ids: string[] }
  window: { start: string; end: string; months: 3 | 6 }
  county: CountyBlock
  employers: Array<CaseEmployer & { person: 'taxpayer' | 'spouse' }>
  standards_version: { effective_date: string; source_url: string } | null
  required: { confirmed: number; total: number; missing: string[] }
  sections: Array<{ id: SectionId; title: string; lines: LineView[] }>
}

const toProposalView = (p: ProposalRow): ProposalView => ({
  id: p.id,
  source: p.source,
  proposed_value: p.proposed_value,
  method: p.method,
  window_start: p.window_start,
  window_end: p.window_end,
  reliability: p.reliability,
  source_refs: p.source_refs,
  created_at: p.created_at,
})

// The decision that set the current value: the newest accepted or edited row.
function latestDecided(rows: ProposalRow[]): ProposalRow | null {
  let best: ProposalRow | null = null
  for (const r of rows) {
    if ((r.status === 'accepted' || r.status === 'edited') && (!best || (r.decided_at ?? '') > (best.decided_at ?? ''))) best = r
  }
  return best
}

function lineView(meta: LineMeta, row: Record<string, unknown>, rows: ProposalRow[], names: Record<string, string>): LineView {
  if (meta.column === null) return { ...meta, value: null, status: 'standard', confirmed: null, proposals: [] }
  const value = row[meta.column] ?? null
  const proposals = rows.filter((r) => r.status === 'proposed').map(toProposalView)
  if (value === null) return { ...meta, value, status: proposals.length > 0 ? 'proposed' : 'needs_data', confirmed: null, proposals }
  const decided = latestDecided(rows)
  return {
    ...meta,
    value,
    status: decided?.status === 'edited' ? 'edited' : 'confirmed',
    confirmed: {
      proposal_id: decided?.id ?? null,
      source: decided?.source ?? null,
      by_name: decided?.decided_by ? (names[decided.decided_by] ?? null) : null,
      at: decided?.decided_at ?? null,
    },
    proposals,
  }
}

export const settingsOf = (raw: Record<string, unknown> | null | undefined): FinancialsView['settings'] => {
  const ids = raw?.spouse_employer_ids
  return {
    window_months: raw?.window_months === 6 ? 6 : 3,
    spouse_employer_ids: Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [],
  }
}

export function buildFinancialsView(input: {
  caseRow: FinancialsCase
  row: Record<string, unknown> | null
  proposals: ProposalRow[]
  staffNames: Record<string, string>
  standardsVersion: { effective_date: string; source_url: string } | null
  county: CountyBlock
  employers: CaseEmployer[]
  now: Date
}): FinancialsView {
  const row = input.row ?? {}
  const byColumn = new Map<string, ProposalRow[]>()
  for (const p of input.proposals) byColumn.set(p.canonical_column, [...(byColumn.get(p.canonical_column) ?? []), p])
  // Same blocking set as evaluateCase: applicable unanswered questions plus NULL required columns.
  const missing = [
    ...new Set([...missingQuestionIds(row).filter((id) => isApplicable(id, row)), ...missingFinancialColumns(row)]),
  ].sort()
  const missingSet = new Set(missing)
  const required = LINES.filter((x) => x.required)
  const lines = LINES.map((meta) => lineView(meta, row, byColumn.get(meta.column ?? '') ?? [], input.staffNames))
  const { id, logics_case_id, first_name, last_name } = input.caseRow
  const settings = settingsOf(input.caseRow.financials_settings)
  return {
    case: { id, logics_case_id, first_name, last_name },
    settings,
    window: completeMonthsWindow(input.now, settings.window_months),
    county: input.county,
    employers: input.employers.map((e) => ({
      ...e,
      person: settings.spouse_employer_ids.includes(e.employer_id) ? 'spouse' : 'taxpayer',
    })),
    standards_version: input.standardsVersion,
    required: {
      confirmed: required.filter((x) => !missingSet.has(x.column as string)).length,
      total: required.length,
      missing,
    },
    sections: SECTIONS.map((s) => ({ ...s, lines: lines.filter((x) => x.section === s.id) })),
  }
}
