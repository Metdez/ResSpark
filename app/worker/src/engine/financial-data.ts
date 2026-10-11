// Port of src/financial_data.py plus the row helpers of src/intake_workflow.py.
// Field names stay snake_case so DB rows, golden.json and Python share one shape.

export type CaseRow = Readonly<Record<string, unknown>>

export interface FinancialData {
  // Household / profile
  filing_status_married: boolean
  filing_joint_offer: boolean
  state_of_residence: string
  county_of_residence: string
  household_size: number
  dependents_count: number
  age_taxpayer: number
  age_spouse: number
  owns_home: boolean
  rents_home: boolean
  is_wage_earner: boolean
  is_self_employed: boolean
  vehicle_count: number
  // Section 7, Box D: monthly household income
  gross_wages_taxpayer: number
  gross_wages_spouse: number
  social_security_income: number
  pension_income: number
  other_income: number
  interest_dividends_royalties: number
  distributions_income: number
  net_rental_income: number
  net_business_income: number
  child_support_received: number
  alimony_received: number
  // Section 7, Box E: monthly household expenses (actual amounts)
  actual_housing_utilities: number
  actual_vehicle_loan_lease: number
  actual_vehicle_operating: number
  actual_public_transportation: number
  actual_health_insurance_premiums: number
  actual_court_ordered_payments: number
  actual_child_dependent_care: number
  actual_life_insurance_premiums: number
  actual_current_taxes: number
  actual_delinquent_state_local_tax: number
  actual_secured_debts_other: number
  // Section 3: personal assets
  cash_and_bank_balances: number
  investment_accounts_net: number
  retirement_accounts_market_value: number
  retirement_accounts_loan_balance: number
  life_insurance_cash_value: number
  life_insurance_loan_balance: number
  real_property_market_value: number
  real_property_loan_balance: number
  vehicle_market_value_total: number
  vehicle_loan_balance_total: number
  vehicle_market_values: number[]
  vehicle_loan_balances: number[]
  other_valuable_assets_value: number
  other_valuable_assets_loan: number
  // Section 9: compliance / eligibility gates
  all_returns_filed: boolean
  in_open_bankruptcy: boolean
  filed_bankruptcy_past_7yrs: boolean
  in_litigation: boolean
  prior_ia_or_oic_default: boolean
  filed_and_paid_timely_last_5_years: boolean
  installment_agreement_last_5_years: boolean
  // Liability
  total_tax_owed: number
  tax_only_balance: number | null
  csed_months_remaining: number
  oic_payment_months: number | null
  // Review output
  ai_flags: unknown[]
}

// Dataclass field order of FinancialData.
export const FINANCIAL_DATA_FIELDS: readonly (keyof FinancialData)[] = [
  'filing_status_married', 'filing_joint_offer', 'state_of_residence', 'county_of_residence',
  'household_size', 'dependents_count', 'age_taxpayer', 'age_spouse', 'owns_home', 'rents_home',
  'is_wage_earner', 'is_self_employed', 'vehicle_count',
  'gross_wages_taxpayer', 'gross_wages_spouse', 'social_security_income', 'pension_income',
  'other_income', 'interest_dividends_royalties', 'distributions_income', 'net_rental_income',
  'net_business_income', 'child_support_received', 'alimony_received',
  'actual_housing_utilities', 'actual_vehicle_loan_lease', 'actual_vehicle_operating',
  'actual_public_transportation', 'actual_health_insurance_premiums', 'actual_court_ordered_payments',
  'actual_child_dependent_care', 'actual_life_insurance_premiums', 'actual_current_taxes',
  'actual_delinquent_state_local_tax', 'actual_secured_debts_other',
  'cash_and_bank_balances', 'investment_accounts_net', 'retirement_accounts_market_value',
  'retirement_accounts_loan_balance', 'life_insurance_cash_value', 'life_insurance_loan_balance',
  'real_property_market_value', 'real_property_loan_balance', 'vehicle_market_value_total',
  'vehicle_loan_balance_total', 'vehicle_market_values', 'vehicle_loan_balances',
  'other_valuable_assets_value', 'other_valuable_assets_loan',
  'all_returns_filed', 'in_open_bankruptcy', 'filed_bankruptcy_past_7yrs', 'in_litigation',
  'prior_ia_or_oic_default', 'filed_and_paid_timely_last_5_years', 'installment_agreement_last_5_years',
  'total_tax_owed', 'tax_only_balance', 'csed_months_remaining', 'oic_payment_months',
  'ai_flags',
]

// REQUIRED_FINANCIAL_COLUMNS: every field minus ai_flags, oic_payment_months, tax_only_balance.
const OPTIONAL_FIELDS = new Set(['ai_flags', 'oic_payment_months', 'tax_only_balance'])
export const REQUIRED_FINANCIAL_COLUMNS: readonly string[] = FINANCIAL_DATA_FIELDS
  .filter((name) => !OPTIONAL_FIELDS.has(name))
  .sort()

export class MissingFactError extends Error {
  readonly columns: string[]

  constructor(columns: string[]) {
    super(`Cannot build FinancialData; missing: ${columns.join(', ')}`)
    this.name = 'MissingFactError'
    this.columns = columns
  }
}

// missing_financial_columns: required inputs still NULL (`is None`), sorted.
export function missingFinancialColumns(row: CaseRow): string[] {
  return REQUIRED_FINANCIAL_COLUMNS.filter((name) => row[name] == null)
}

// financial_data_from_case_row. shortcut: values are taken as stored (Python's Decimal
// conversion has no JS counterpart); add coercion if a caller passes numeric strings.
export function financialDataFromCaseRow(row: CaseRow): FinancialData {
  const missing = missingFinancialColumns(row)
  if (missing.length > 0) throw new MissingFactError(missing)
  const values: Record<string, unknown> = {}
  for (const name of FINANCIAL_DATA_FIELDS) {
    values[name] = name === 'ai_flags' ? row[name] || [] : (row[name] ?? null)
  }
  return values as unknown as FinancialData
}
