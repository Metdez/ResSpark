// Port of _health, _retirement, _life and _investment in src/document_parse.py.
import { money, pairs, pick } from './fields'

export const health = (texts: readonly string[]) => ({
  _kind: 'health',
  actual_health_insurance_premiums: money(pick(pairs(texts), 'Monthly Premium', 'Premium')),
})

export const retirement = (texts: readonly string[]) => {
  const found = pairs(texts)
  const row: Record<string, unknown> = {
    _kind: 'retirement',
    retirement_accounts_market_value: money(pick(found, 'Market Value', 'Account Value')),
  }
  if (found.has('Loan Balance')) row.retirement_accounts_loan_balance = money(found.get('Loan Balance')!)
  return row
}

export const life = (texts: readonly string[]) => {
  const found = pairs(texts)
  const row: Record<string, unknown> = { _kind: 'life', life_insurance_cash_value: money(pick(found, 'Cash Value')) }
  if (found.has('Policy Loan') || found.has('Loan Balance'))
    row.life_insurance_loan_balance = money(pick(found, 'Policy Loan', 'Loan Balance'))
  return row
}

export const investment = (texts: readonly string[]) => ({
  _kind: 'investment',
  investment_accounts_net: money(pick(pairs(texts), 'Net Value', 'Account Value')),
})
