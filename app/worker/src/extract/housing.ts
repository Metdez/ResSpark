// Port of _lease, _mortgage and _utility in src/document_parse.py.
import { money, pairs, pick, stateCode } from './fields'

export const lease = (texts: readonly string[]) => {
  const found = pairs(texts)
  return {
    _kind: 'lease',
    actual_housing_utilities: money(pick(found, 'Monthly Rent', 'Rent')),
    state_of_residence: stateCode(pick(found, 'Property Address')),
    rents_home: true,
    owns_home: false,
  }
}

export const mortgage = (texts: readonly string[]) => {
  const found = pairs(texts)
  return {
    _kind: 'mortgage',
    actual_housing_utilities: money(pick(found, 'Monthly Payment (PITI)', 'PITI')),
    real_property_loan_balance: money(pick(found, 'Current Principal Balance', 'Principal Balance')),
    real_property_market_value: money(pick(found, 'Estimated Market Value')),
    state_of_residence: stateCode(pick(found, 'Property Address')),
    owns_home: true,
    rents_home: false,
    has_real_property: true,
  }
}

export const utility = (texts: readonly string[]) => ({
  _kind: 'utility',
  actual_housing_utilities: money(pick(pairs(texts), 'Amount Due', 'Current Charges', 'Total Due')),
})
