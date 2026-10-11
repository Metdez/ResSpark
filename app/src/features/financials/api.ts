import { api, isObject } from '@/lib/api'

// SPA mirror of app/worker/src/financials/{view,county,evaluate}.ts and the worksheet export (Plans 04-06).
export type LineKind = 'money' | 'count' | 'bool' | 'text' | 'money_list'
export type LineStatus = 'needs_data' | 'proposed' | 'confirmed' | 'edited' | 'standard'
export type DecideAction = 'accept' | 'edit' | 'known_zero' | 'unknown' | 'reject' | 'not_applicable'
export type CountyStatus = 'confirmed_address' | 'from_other_address' | 'not_in_irs_table' | 'ct_old_county' | 'waiting_for_address'

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

export interface LineView {
  column: string | null
  section: string
  line: string | null
  label: string
  kind: LineKind
  required: boolean
  na_rule: 'not_married' | 'owns_home' | 'not_wage_earner' | null
  allowable_key?: string
  standard_key?: string
  value: unknown
  status: LineStatus
  confirmed: { proposal_id: string | null; source: string | null; by_name: string | null; at: string | null } | null
  proposals: ProposalView[]
}

export interface CountyBlock {
  status: CountyStatus
  state_code: string | null
  county_fips: string | null
  smarty_county: string | null
  irs_county: string | null
  address_source: 'smarty' | 'manual' | null
  address_verified: boolean
}

export interface Employer {
  employer_id: string
  connection_id: string
  company_name: string | null
  status: string
  person: 'taxpayer' | 'spouse'
}

export interface FinancialsView {
  case: { id: string; logics_case_id: number | null; first_name: string | null; last_name: string | null }
  settings: { window_months: 3 | 6; spouse_employer_ids: string[] }
  window: { start: string; end: string; months: 3 | 6 }
  county: CountyBlock
  employers: Employer[]
  standards_version: { effective_date: string; source_url: string } | null
  required: { confirmed: number; total: number; missing: string[] }
  sections: Array<{ id: string; title: string; lines: LineView[] }>
}

export interface RunView {
  id: string
  created_at: string
  status: string
  path: string
  reason: string
  outcome: { id: string; label: string } | null
  next: string
  monthly_income: number
  monthly_expenses: number
  net_disposable_income: number
  net_realizable_equity: number
  suggested_offer_or_payment: number
  needs_manual_review: boolean
  review_flags: string[]
  allowable_breakdown: Record<string, number>
  nre_lines: Array<{ key: string; label: string; value: number }>
  standards_inputs: Record<string, unknown>
  standards_effective_date: string | null
  engine_version: string
  payment_math: { total_tax_owed: number; csed_months_used: number } | null
  created_by_name: string | null
}

export type EvaluationResponse =
  | { run: RunView; outcome: { kind: 'determination' } }
  | { run: null; outcome: { kind: 'information_needed'; missing: Array<{ column: string; label: string }>; review_flags: string[] } }
  | { run: null; outcome: { kind: 'standards_unavailable'; message: string } }

export interface WorksheetExport {
  document_id: string
  file_name: string
  pages: number
  request_id: string | null
  already: boolean
}

const KINDS: readonly unknown[] = ['money', 'count', 'bool', 'text', 'money_list']
const STATUSES: readonly unknown[] = ['needs_data', 'proposed', 'confirmed', 'edited', 'standard']
const COUNTY: readonly unknown[] = ['confirmed_address', 'from_other_address', 'not_in_irs_table', 'ct_old_county', 'waiting_for_address']
const str = (v: unknown): v is string => typeof v === 'string'
const strOrNull = (v: unknown) => v === null || typeof v === 'string'
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const strings = (v: unknown) => Array.isArray(v) && v.every(str)

const isProposal = (v: unknown): v is ProposalView =>
  isObject(v) && str(v.id) && str(v.source) && str(v.method) && str(v.created_at) && Array.isArray(v.source_refs)

const isLine = (v: unknown): v is LineView =>
  isObject(v) &&
  strOrNull(v.column) &&
  str(v.section) &&
  strOrNull(v.line) &&
  str(v.label) &&
  KINDS.includes(v.kind) &&
  STATUSES.includes(v.status) &&
  typeof v.required === 'boolean' &&
  (v.confirmed === null || isObject(v.confirmed)) &&
  Array.isArray(v.proposals) &&
  v.proposals.every(isProposal)

const isCounty = (v: unknown): v is CountyBlock => isObject(v) && COUNTY.includes(v.status)

const isEmployer = (v: unknown): v is Employer =>
  isObject(v) && str(v.employer_id) && strOrNull(v.company_name) && (v.person === 'taxpayer' || v.person === 'spouse')

export const isFinancialsView = (v: unknown): v is FinancialsView =>
  isObject(v) &&
  isObject(v.case) &&
  str(v.case.id) &&
  isObject(v.settings) &&
  strings(v.settings.spouse_employer_ids) &&
  isObject(v.window) &&
  str(v.window.start) &&
  str(v.window.end) &&
  (v.window.months === 3 || v.window.months === 6) &&
  isCounty(v.county) &&
  Array.isArray(v.employers) &&
  v.employers.every(isEmployer) &&
  isObject(v.required) &&
  num(v.required.confirmed) &&
  num(v.required.total) &&
  Array.isArray(v.sections) &&
  v.sections.every((s) => isObject(s) && str(s.id) && str(s.title) && Array.isArray(s.lines) && s.lines.every(isLine))

const isRunView = (v: unknown): v is RunView =>
  isObject(v) &&
  str(v.id) &&
  str(v.path) &&
  str(v.reason) &&
  str(v.next) &&
  [v.monthly_income, v.monthly_expenses, v.net_disposable_income, v.net_realizable_equity, v.suggested_offer_or_payment].every(num) &&
  strings(v.review_flags) &&
  isObject(v.allowable_breakdown) &&
  Array.isArray(v.nre_lines) &&
  v.nre_lines.every((x) => isObject(x) && str(x.key) && str(x.label) && num(x.value)) &&
  isObject(v.standards_inputs) &&
  strOrNull(v.standards_effective_date) &&
  (v.payment_math === null || (isObject(v.payment_math) && num(v.payment_math.total_tax_owed) && num(v.payment_math.csed_months_used)))

export const isEvaluationResponse = (v: unknown): v is EvaluationResponse => {
  if (!isObject(v) || !isObject(v.outcome)) return false
  const o = v.outcome
  if (o.kind === 'determination') return isRunView(v.run)
  if (v.run !== null) return false
  if (o.kind === 'standards_unavailable') return true
  return o.kind === 'information_needed' && Array.isArray(o.missing) && o.missing.every((m) => isObject(m) && str(m.label)) && strings(o.review_flags)
}

const isLatest = (v: unknown): v is { run: RunView | null } => isObject(v) && (v.run === null || isRunView(v.run))
const isDecided = (v: unknown): v is { column: string; action: string } => isObject(v) && str(v.column) && str(v.action)
const isQueued = (v: unknown): v is { queued: true } => isObject(v) && v.queued === true
const isWorksheetExport = (v: unknown): v is WorksheetExport =>
  isObject(v) && str(v.document_id) && str(v.file_name) && strOrNull(v.request_id) && typeof v.already === 'boolean'

const base = (caseId: string) => `/api/admin/cases/${encodeURIComponent(caseId)}`
const post = (body: unknown = {}) => ({ method: 'POST', body: JSON.stringify(body) })

export const getFinancials = (caseId: string) => api(`${base(caseId)}/financials`, {}, isFinancialsView)

export const decide = (
  caseId: string,
  column: string,
  body: { action: DecideAction; proposal_id?: string; value?: unknown; note?: string }
) => api(`${base(caseId)}/financials/${encodeURIComponent(column)}/decide`, post(body), isDecided)

export const refreshProposals = (caseId: string, body: { window_months?: 3 | 6; spouse_employer_ids?: string[] } = {}) =>
  api(`${base(caseId)}/financials/refresh`, post(body), isQueued)

export const runEvaluation = (caseId: string) => api(`${base(caseId)}/evaluations`, post(), isEvaluationResponse)

export const latestEvaluation = (caseId: string) => api(`${base(caseId)}/evaluations/latest`, {}, isLatest)

export const exportWorksheet = (caseId: string, runId: string) =>
  api(`${base(caseId)}/evaluations/${encodeURIComponent(runId)}/worksheet`, post(), isWorksheetExport)

// SPA mirror of app/worker/src/financials/extract-proposals.ts (Plan 12).
export type ExtractReason = 'no_template' | 'missing_fields' | 'unreadable' | 'too_large' | 'not_pdf'
export interface ExtractResult {
  documents: number
  parsed: number
  failed: Array<{ document_id: string; name: string; reason: 'no_template' | 'missing_fields' | 'unreadable' }>
  skipped: Array<{ document_id: string; name: string; reason: 'too_large' | 'not_pdf' }>
  proposals: { inserted: number; kept: number; superseded: number }
}
const isFiles = (v: unknown, reasons: readonly unknown[]) =>
  Array.isArray(v) && v.every((f) => isObject(f) && str(f.document_id) && str(f.name) && reasons.includes(f.reason))
export const isExtractResult = (v: unknown): v is ExtractResult =>
  isObject(v) &&
  num(v.documents) &&
  num(v.parsed) &&
  isFiles(v.failed, ['no_template', 'missing_fields', 'unreadable']) &&
  isFiles(v.skipped, ['too_large', 'not_pdf']) &&
  isObject(v.proposals) &&
  num(v.proposals.inserted) &&
  num(v.proposals.kept) &&
  num(v.proposals.superseded)

export const extractValues = (caseId: string) => api(`${base(caseId)}/financials/extract`, post(), isExtractResult)

// SPA mirror of app/worker/src/financials/evidence.ts (Plan 10). Amounts are the server's; the SPA only formats them.
export interface BankTxnView {
  id: string
  date: string
  name: string | null
  merchant_name: string | null
  amount: number
  account: string
}
type EvidenceBase = { column: string; label: string; proposal_id: string }
export type EvidenceView =
  | (EvidenceBase & {
      kind: 'bank'
      window: { start: string; end: string; months: number }
      months: Array<{ month: string; subtotal: number; transactions: BankTxnView[] }>
      average: number
      truncated: boolean
      cross_check: { label: string; monthly: number } | null
    })
  | (EvidenceBase & {
      kind: 'balances'
      accounts: Array<{ id: string; account: string; type: string | null; subtype: string | null; balance_current: number | null; balance_as_of: string | null }>
      total: number
    })
  | (EvidenceBase & {
      kind: 'payroll'
      window: { start: string; end: string }
      stubs: Array<{ employer: string | null; pay_date: string; gross: number | null; frequency: string | null; document_url: string | null }>
      formula: Array<{ employer: string | null; sum: number; stubs: number; periods_per_year: number; monthly: number }>
      method: string
      value: unknown
      cross_check: { label: string; monthly: number } | null
    })
  | (EvidenceBase & { kind: 'intake'; prompt: string; answer: unknown; answered_at: string })
  | (EvidenceBase & { kind: 'logics'; field: string; value: unknown; fetched_at: string })
  | (EvidenceBase & {
      kind: 'address'
      address: { line1: string | null; line2: string | null; city: string | null; state_code: string | null; zip5: string | null }
      county: string | null
      fips: string | null
      source: string | null
    })
  | (EvidenceBase & { kind: 'staff'; by_name: string | null; at: string | null; note: string | null; value: unknown })
  | (EvidenceBase & { kind: 'document'; documents: Array<{ id: string; name: string; url: string | null }> })
  | { kind: 'none'; column: string; label: string }

const numOrNull = (v: unknown) => v === null || num(v)
// Only https links reach an href (T-07-42: the Worker sends short-lived signed URLs).
const urlOrNull = (v: unknown) => v === null || (str(v) && v.startsWith('https://'))
const isTxn = (v: unknown) => isObject(v) && str(v.id) && str(v.date) && num(v.amount) && str(v.account)
const isCrossCheck = (v: unknown) => v === null || (isObject(v) && str(v.label) && num(v.monthly))

export const isEvidenceView = (v: unknown): v is EvidenceView => {
  if (!isObject(v) || !str(v.column) || !str(v.label)) return false
  if (v.kind === 'none') return true
  if (!str(v.proposal_id)) return false
  if (v.kind === 'bank')
    return (
      isObject(v.window) &&
      str(v.window.start) &&
      num(v.window.months) &&
      Array.isArray(v.months) &&
      v.months.every((m) => isObject(m) && str(m.month) && num(m.subtotal) && Array.isArray(m.transactions) && m.transactions.every(isTxn)) &&
      num(v.average) &&
      typeof v.truncated === 'boolean' &&
      isCrossCheck(v.cross_check)
    )
  if (v.kind === 'balances')
    return (
      Array.isArray(v.accounts) &&
      v.accounts.every((a) => isObject(a) && str(a.id) && str(a.account) && numOrNull(a.balance_current) && strOrNull(a.balance_as_of)) &&
      num(v.total)
    )
  if (v.kind === 'payroll')
    return (
      isObject(v.window) &&
      Array.isArray(v.stubs) &&
      v.stubs.every((s) => isObject(s) && str(s.pay_date) && strOrNull(s.employer) && numOrNull(s.gross) && strOrNull(s.frequency) && urlOrNull(s.document_url)) &&
      Array.isArray(v.formula) &&
      v.formula.every((f) => isObject(f) && num(f.sum) && num(f.stubs) && num(f.periods_per_year) && num(f.monthly)) &&
      str(v.method) &&
      isCrossCheck(v.cross_check)
    )
  if (v.kind === 'intake') return str(v.prompt) && str(v.answered_at)
  if (v.kind === 'logics') return str(v.field) && str(v.fetched_at)
  if (v.kind === 'address') return isObject(v.address) && strOrNull(v.county) && strOrNull(v.fips) && strOrNull(v.source)
  if (v.kind === 'staff') return strOrNull(v.by_name) && strOrNull(v.at) && strOrNull(v.note)
  if (v.kind === 'document') return Array.isArray(v.documents) && v.documents.every((d) => isObject(d) && str(d.id) && str(d.name) && urlOrNull(d.url))
  return false
}

export const getEvidence = (caseId: string, column: string, proposalId: string | null = null) =>
  api(
    `${base(caseId)}/financials/${encodeURIComponent(column)}/evidence${proposalId ? `?proposal_id=${encodeURIComponent(proposalId)}` : ''}`,
    {},
    isEvidenceView
  )
