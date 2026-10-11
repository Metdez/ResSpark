// Port of _auto, _valuation, _combine_autos and _collected_values in src/document_parse.py.
import { dec, money, pairs, pick, sumDec, toFloat } from './fields'

type Part = Record<string, unknown>

const VALUE_LABELS = ['Est. Market Value', 'Estimated Market Value', 'Market Value']

export const auto = (texts: readonly string[]): Part => {
  const found = pairs(texts)
  if (!['Monthly Payment', 'Remaining Balance', 'Payoff Balance', 'Loan Balance'].some((label) => found.has(label))) {
    const value = money(pick(found, ...VALUE_LABELS))
    return { _kind: 'auto', vehicle_market_values: [value], vehicle_market_value_total: value, vehicle_count: 1 }
  }
  const balance = money(pick(found, 'Remaining Balance', 'Payoff Balance', 'Loan Balance'))
  const row: Part = {
    _kind: 'auto',
    actual_vehicle_loan_lease: money(pick(found, 'Monthly Payment')),
    vehicle_loan_balances: [balance],
    vehicle_loan_balance_total: balance,
    vehicle_count: 1,
  }
  const valueLabel = VALUE_LABELS.find((label) => found.has(label))
  if (valueLabel) {
    const value = money(found.get(valueLabel)!)
    row.vehicle_market_values = [value]
    row.vehicle_market_value_total = value
  }
  return row
}

export const valuation = (texts: readonly string[]): Part => ({
  _kind: 'valuation',
  real_property_market_value: money(pick(pairs(texts), 'Assessed Value', 'Estimated Market Value', 'Market Value')),
  has_real_property: true,
})

// Python `item.get(key) or []`: a missing, null or empty list contributes nothing.
const listOf = (item: Part, key: string): number[] => (item[key] as number[] | null | undefined) ?? []

const decimalTotal = (values: readonly number[]): number => toFloat(sumDec(values.map((value) => dec(value))))

const collectedValues = (items: readonly Part[]): number[] => items.flatMap((item) => listOf(item, 'vehicle_market_values'))

// A registration plus a valuation plus a loan is not three cars: value-only files fill
// vehicles that have no value yet, in order.
export const combineAutos = (statements: readonly Part[]): Part => {
  const loans = statements.filter((item) => 'vehicle_loan_balances' in item)
  const extras = statements.filter((item) => !('vehicle_loan_balances' in item))
  if (!loans.length) {
    const values = collectedValues(extras)
    const row: Part = {
      actual_vehicle_loan_lease: 0,
      vehicle_loan_balances: extras.map(() => 0),
      vehicle_loan_balance_total: 0,
      vehicle_count: extras.length,
    }
    if (values.length) {
      row.vehicle_market_values = values
      row.vehicle_market_value_total = decimalTotal(values)
    }
    return row
  }
  const balances: number[] = []
  let values: number[] = []
  const payments = []
  for (const item of loans) {
    payments.push(dec(item.actual_vehicle_loan_lease as number))
    balances.push(...(item.vehicle_loan_balances as number[]))
    values.push(...listOf(item, 'vehicle_market_values'))
  }
  const row: Part = {
    actual_vehicle_loan_lease: toFloat(sumDec(payments)),
    vehicle_loan_balances: balances,
    vehicle_loan_balance_total: decimalTotal(balances),
    vehicle_count: loans.length,
  }
  if (!values.length) values = collectedValues(extras).slice(0, loans.length)
  if (values.length) {
    row.vehicle_market_values = values
    row.vehicle_market_value_total = decimalTotal(values)
  }
  return row
}
