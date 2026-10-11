// Port of merge_documents, _sum_amounts, _sum_present, _apply_income and _covered_by_stub
// in src/document_parse.py. Repeating stubs, W-2s, health, auto and account files add up.
import { combineBanks, samePayer } from './bank-statement'
import { add, dec, sumDec, toFloat, ZERO, type Dec } from './fields'
import type { ParsedDocument } from './parse'
import { combineAutos } from './vehicle'

type Part = Record<string, unknown>

const GROUPED = ['bank', 'auto', 'pay_stub', 'wage', 'health', 'utility', 'retirement', 'life', 'investment']

const sumAmounts = (items: readonly Part[], key: string): number =>
  toFloat(sumDec(items.filter((item) => key in item).map((item) => dec(item[key] as number))))

const sumPresent = (row: Part, items: readonly Part[], key: string): void => {
  if (items.some((item) => key in item)) row[key] = sumAmounts(items, key)
}

// Python `value or 0` for a number that may be missing or null.
const orZero = (value: unknown): Dec => (value ? dec(value as number) : ZERO)

const coveredByStub = (employer: string | undefined, employers: readonly string[]): boolean => {
  if (!employers.length) return false
  if (!employer) return true
  return employers.some((known) => samePayer(employer, known) || samePayer(known, employer))
}

const applyIncome = (row: Part, stubs: readonly Part[], wages: readonly Part[]): string[] => {
  const employers = stubs.map((stub) => stub._employer as string).filter(Boolean)
  if (!stubs.length && !wages.length) return employers
  let gross = sumDec(stubs.map((stub) => dec(stub.gross_wages_taxpayer as number)))
  const taxes = sumDec(stubs.map((stub) => orZero(stub.actual_current_taxes)))
  for (const wage of wages) {
    const employer = wage._employer as string | undefined
    // employers grows inside the loop, as in Python: a later W-2 from the same payer is covered.
    if (coveredByStub(employer, employers)) continue
    gross = add(gross, dec(wage.gross_wages_taxpayer as number))
    if (employer) employers.push(employer)
  }
  row.gross_wages_taxpayer = toFloat(gross)
  if (stubs.length) {
    row.actual_current_taxes = toFloat(taxes)
    const frequencies = new Set(stubs.map((stub) => stub.pay_frequency).filter(Boolean))
    if (frequencies.size === 1) row.pay_frequency = [...frequencies][0]
    if (stubs.some((stub) => stub.is_wage_earner === true)) row.is_wage_earner = true
  }
  return employers
}

export function mergeDocuments(parts: ParsedDocument[]): Record<string, unknown> {
  const row: Part = {}
  const groups = new Map<string, Part[]>(GROUPED.map((kind) => [kind, []]))
  for (const { _kind: kind, ...part } of parts) {
    if (kind === undefined) throw new Error("KeyError: '_kind'")
    const group = groups.get(kind)
    if (group) group.push(part)
    else if (kind === 'bankruptcy')
      row.ai_flags = [...((row.ai_flags as string[]) ?? []), 'Bankruptcy documents were uploaded and need professional review.']
    else Object.assign(row, part)
  }
  const get = (kind: string) => groups.get(kind)!
  const employers = applyIncome(row, get('pay_stub'), get('wage'))
  if (get('health').length)
    row.actual_health_insurance_premiums = sumAmounts(get('health'), 'actual_health_insurance_premiums')
  if (get('utility').length) {
    const base = orZero(row.actual_housing_utilities)
    row.actual_housing_utilities = toFloat(add(base, dec(sumAmounts(get('utility'), 'actual_housing_utilities'))))
  }
  if (get('retirement').length) {
    row.retirement_accounts_market_value = sumAmounts(get('retirement'), 'retirement_accounts_market_value')
    sumPresent(row, get('retirement'), 'retirement_accounts_loan_balance')
  }
  if (get('life').length) {
    row.life_insurance_cash_value = sumAmounts(get('life'), 'life_insurance_cash_value')
    sumPresent(row, get('life'), 'life_insurance_loan_balance')
  }
  if (get('investment').length) row.investment_accounts_net = sumAmounts(get('investment'), 'investment_accounts_net')
  if (get('bank').length) Object.assign(row, combineBanks(get('bank'), employers))
  if (get('auto').length) Object.assign(row, combineAutos(get('auto')))
  return row
}
