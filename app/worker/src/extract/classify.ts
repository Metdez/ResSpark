// Port of _head, _classify and _TYPE_HINTS in src/document_parse.py.
import { has, strip } from './fields'

// irs_transcripts is omitted: that slot holds both an account transcript and a wage transcript.
export const TYPE_HINTS: Record<string, string> = {
  bank_statements: 'bank',
  personal_bank_statements: 'bank',
  pay_stubs: 'pay_stub',
  lease: 'lease',
  lease_statement: 'lease',
  rent: 'lease',
  mortgage_statement: 'mortgage',
  auto_loan_statement: 'auto',
  vehicle: 'auto',
  health_insurance_statement: 'health',
  housing_utilities: 'utility',
  self_employment: 'business',
  retirement: 'retirement',
  insurance: 'life',
  investments: 'investment',
  bankruptcy: 'bankruptcy',
}

export const head = (texts: readonly string[]): string =>
  texts
    .slice(0, 12)
    .map((text) => strip(text).toLowerCase())
    .join(' ')

// Ordered like Python: the first rule that matches the first 12 lines wins.
const RULES: Array<[string, string[]]> = [
  ['account', ['account transcript', 'balance notice']],
  ['life', ['life insurance']],
  ['retirement', ['retirement']],
  ['business', ['profit and loss', 'schedule c']],
  ['investment', ['brokerage', 'investment account']],
  ['bankruptcy', ['bankruptcy']],
  ['bank', ['checking', 'bank statement', 'account statement']],
  ['pay_stub', ['earnings statement', 'pay stub', 'paystub']],
  ['lease', ['rent', 'lease']],
  ['mortgage', ['mortgage', 'heloc']],
  ['auto', ['auto loan', 'vehicle loan']],
  ['health', ['premium', 'health insurance']],
]

export const classify = (texts: readonly string[], documentType: string | null): string | null => {
  const text = head(texts)
  if ((has(text, 'wage') && has(text, 'income')) || has(text, 'wage and tax statement')) return 'wage'
  for (const [kind, phrases] of RULES) if (phrases.some((phrase) => has(text, phrase))) return kind
  if (documentType === 'real_property') return 'valuation'
  return TYPE_HINTS[documentType ?? ''] ?? null
}
