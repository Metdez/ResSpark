// Port of src/intake_workflow.py (the parts the Worker evaluates; question
// declarations and validation live in app/shared/questions.ts).
import { isApplicable, QUESTIONS } from '../../../shared/questions'
import { type Determination, determineResolutionPath } from './resolution-path'
import {
  type CaseRow,
  financialDataFromCaseRow,
  missingFinancialColumns,
} from './financial-data'
import type { StandardsRepository } from './standards'

export { missingFinancialColumns }

export interface DocumentRequest {
  code: string
  title: string
  reason: string
  required: boolean
}

const request = (code: string, title: string, reason: string, required = true): DocumentRequest => ({
  code,
  title,
  reason,
  required,
})

// _REQUESTS, verbatim.
export const DOCUMENT_REQUESTS: Readonly<Record<string, DocumentRequest>> = {
  irs_transcripts: request('irs_transcripts', 'IRS account transcript', 'Upload an IRS account transcript or balance notice. Include a wage and income transcript here if you have it.'),
  bank_statements: request('bank_statements', 'Recent personal bank statements', 'Upload statements for each of the most recent three months.'),
  pay_stubs: request('pay_stubs', 'Recent pay stubs and W-2', 'Upload your recent pay stubs and latest W-2.'),
  self_employment: request('self_employment', 'Self-employment records', 'Upload a recent profit-and-loss report, business bank statements, and the applicable Schedule C, E, or F.'),
  real_property: request('real_property', 'Real-property records', 'Upload a mortgage or HELOC statement if applicable, plus a property valuation or tax assessment.'),
  lease: request('lease', 'Lease agreement', 'Upload your current residential lease agreement.'),
  housing_utilities: request('housing_utilities', 'Recent utility statement', 'Optionally upload a recent utility statement for your residence.', false),
  vehicle: request('vehicle', 'Vehicle records', 'Upload registration and a current valuation for each vehicle. Include a loan or lease statement only when one exists.'),
  retirement: request('retirement', 'Retirement-account records', 'Upload recent retirement-account and retirement-loan statements.'),
  insurance: request('insurance', 'Life-insurance records', 'Upload a cash-value statement and any policy-loan statement.'),
  investments: request('investments', 'Investment-account records', 'Upload recent brokerage or investment-account statements.'),
  bankruptcy: request('bankruptcy', 'Bankruptcy records', 'Upload the bankruptcy petition and a current case-status document.'),
}

// missing_question_ids: unanswered questions (`is None`), tax_only_balance excluded, sorted.
export function missingQuestionIds(row: CaseRow): string[] {
  return QUESTIONS.map((question) => question.id)
    .filter((id) => id !== 'tax_only_balance' && row[id] == null)
    .sort()
}

// document_requests_for: Python truthiness on the row values, first-occurrence dedupe.
export function documentRequestsFor(row: CaseRow): DocumentRequest[] {
  const codes = ['irs_transcripts', 'bank_statements']
  if (row.is_wage_earner) codes.push('pay_stubs')
  if (row.is_self_employed) codes.push('self_employment')
  if (row.owns_home || row.has_real_property) codes.push('real_property')
  if (row.owns_home === false && row.rents_home) codes.push('lease')
  if (row.owns_home === true || (row.owns_home === false && row.rents_home === true)) {
    codes.push('housing_utilities')
  }
  if (((row.vehicle_count || 0) as number) > 0) codes.push('vehicle')
  if (row.has_retirement_accounts) codes.push('retirement')
  if (row.has_life_insurance_cash_value) codes.push('insurance')
  if (row.has_investment_accounts) codes.push('investments')
  if (row.in_open_bankruptcy) codes.push('bankruptcy')
  return [...new Set(codes)].map((code) => DOCUMENT_REQUESTS[code])
}

const FLAG_LABELS: readonly (readonly [string, string])[] = [
  ['filed_bankruptcy_past_7yrs', 'Prior bankruptcy in the past seven years'],
  ['in_litigation', 'Current litigation'],
  ['prior_ia_or_oic_default', 'Prior IRS agreement or offer default'],
]

// _review_flags: only `is True` counts.
const reviewFlags = (row: CaseRow): string[] =>
  FLAG_LABELS.filter(([field]) => row[field] === true).map(([, label]) => label)

export interface WorkflowResult {
  status: 'information_needed' | 'blocked' | 'ready_for_review' | 'ready'
  missing_question_ids: string[]
  missing_financial_fields: string[]
  review_flags: string[]
  document_requests: DocumentRequest[]
  determination: Determination | null
}

// evaluate_case: missing facts block; a complete case needs a standards repository.
export function evaluateCase(
  row: CaseRow,
  repo: StandardsRepository | null
): WorkflowResult {
  const missingQuestions = missingQuestionIds(row).filter((id) => isApplicable(id, row))
  const missingFields = missingFinancialColumns(row)
  const requests = documentRequestsFor(row)
  const flags = reviewFlags(row)

  if (missingQuestions.length > 0 || missingFields.length > 0) {
    return {
      status: 'information_needed',
      missing_question_ids: missingQuestions,
      missing_financial_fields: missingFields,
      review_flags: flags,
      document_requests: requests,
      determination: null,
    }
  }

  if (repo == null) {
    throw new Error('A database-backed standards repository is required for a complete case.')
  }

  const determination = determineResolutionPath(financialDataFromCaseRow(row), repo)
  const status = determination.path.startsWith('BLOCKED')
    ? 'blocked'
    : flags.length > 0 || determination.needs_manual_review
      ? 'ready_for_review'
      : 'ready'
  return {
    status,
    missing_question_ids: [],
    missing_financial_fields: [],
    review_flags: [...flags, ...determination.review_notes],
    document_requests: requests,
    determination,
  }
}
