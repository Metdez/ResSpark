// 433-A line metadata for the staff view (D-14). Static data only: no amounts, no categories.
// Line numbers are Form 433-A Rev. 6-2026 (.planning/research/FEATURES.md §(f)).
import { QUESTIONS } from '../../../shared/questions'
import { REQUIRED_FINANCIAL_COLUMNS } from '../engine/financial-data'

export type SectionId = 'household' | 'employment' | 'income' | 'expenses' | 'assets' | 'compliance' | 'liability'
export type LineKind = 'money' | 'count' | 'bool' | 'text' | 'money_list'
export type NaRule = 'not_married' | 'owns_home' | 'not_wage_earner'
export type StandardKey = 'national' | 'housing' | 'ownership' | 'operating' | 'health'

export interface LineMeta {
  column: string | null
  section: SectionId
  line: string | null
  label: string
  kind: LineKind
  required: boolean
  na_rule: NaRule | null
  allowable_key?: string
  standard_key?: StandardKey
}

export const SECTIONS: ReadonlyArray<{ id: SectionId; title: string }> = [
  { id: 'household', title: 'Household' },
  { id: 'employment', title: 'Employment' },
  { id: 'income', title: 'Monthly income' },
  { id: 'expenses', title: 'Monthly expenses' },
  { id: 'assets', title: 'Assets' },
  { id: 'compliance', title: 'Compliance' },
  { id: 'liability', title: 'Tax liability' },
]

// Required = the engine blocks on it (REQUIRED_FINANCIAL_COLUMNS) or it is an intake question
// (missing_question_ids excludes tax_only_balance).
const REQUIRED = new Set([
  ...REQUIRED_FINANCIAL_COLUMNS,
  ...QUESTIONS.map((q) => q.id).filter((id) => id !== 'tax_only_balance'),
])

type Extra = { na_rule?: NaRule; allowable_key?: string; standard_key?: StandardKey }
const l = (
  section: SectionId,
  column: string,
  line: string | null,
  label: string,
  kind: LineKind,
  extra: Extra = {}
): LineMeta => ({ column, section, line, label, kind, required: REQUIRED.has(column), ...extra, na_rule: extra.na_rule ?? null })

// Expense lines whose allowed amount is always the IRS standard: no column, nothing to confirm.
const standardOnly = (line: string, label: string, allowable_key: string, standard_key: StandardKey): LineMeta => ({
  column: null,
  section: 'expenses',
  line,
  label,
  kind: 'money',
  required: false,
  na_rule: null,
  allowable_key,
  standard_key,
})

export const LINES: readonly LineMeta[] = [
  l('household', 'filing_status_married', null, 'Married', 'bool'),
  l('household', 'filing_joint_offer', null, 'Filing jointly with spouse', 'bool', { na_rule: 'not_married' }),
  l('household', 'state_of_residence', null, 'State of residence', 'text'),
  l('household', 'county_of_residence', null, 'County of residence', 'text'),
  l('household', 'household_size', null, 'Household size (including taxpayer)', 'count'),
  l('household', 'dependents_count', null, 'Dependents claimed', 'count'),
  l('household', 'age_taxpayer', null, 'Taxpayer age', 'count'),
  l('household', 'age_spouse', null, 'Spouse age', 'count', { na_rule: 'not_married' }),
  l('household', 'owns_home', null, 'Owns home', 'bool'),
  l('household', 'rents_home', null, 'Rents home', 'bool', { na_rule: 'owns_home' }),

  l('employment', 'is_wage_earner', null, 'Receives W-2 wages', 'bool'),
  l('employment', 'is_self_employed', null, 'Self-employed (Schedule C/E/F)', 'bool'),
  l('employment', 'pay_frequency', null, 'Pay frequency', 'text', { na_rule: 'not_wage_earner' }),

  l('income', 'gross_wages_taxpayer', '21', 'Gross wages, taxpayer', 'money'),
  l('income', 'gross_wages_spouse', '22', 'Gross wages, spouse', 'money'),
  l('income', 'interest_dividends_royalties', '23', 'Interest, dividends and royalties', 'money'),
  l('income', 'net_business_income', '24', 'Net business income', 'money'),
  l('income', 'net_rental_income', '25', 'Net rental income', 'money'),
  l('income', 'distributions_income', '26', 'Distributions (partnership, S-corp)', 'money'),
  l('income', 'pension_income', '27-28', 'Pension income', 'money'),
  l('income', 'social_security_income', '29-30', 'Social Security', 'money'),
  l('income', 'child_support_received', '31', 'Child support received', 'money'),
  l('income', 'alimony_received', '32', 'Alimony received', 'money'),
  l('income', 'other_income', '33-34', 'Other income (unemployment, gig work)', 'money'),

  standardOnly('36', 'Food, clothing and miscellaneous', 'food_clothing_misc', 'national'),
  l('expenses', 'actual_housing_utilities', '37', 'Housing and utilities', 'money', { allowable_key: 'housing_utilities', standard_key: 'housing' }),
  l('expenses', 'actual_vehicle_loan_lease', '38', 'Vehicle loan or lease payments', 'money', { allowable_key: 'vehicle_ownership', standard_key: 'ownership' }),
  l('expenses', 'actual_vehicle_operating', '39', 'Vehicle operating costs', 'money', { allowable_key: 'vehicle_operating', standard_key: 'operating' }),
  l('expenses', 'actual_public_transportation', '40', 'Public transportation', 'money', { allowable_key: 'public_transportation' }),
  l('expenses', 'actual_health_insurance_premiums', '41', 'Health insurance premiums', 'money', { allowable_key: 'health_insurance_premiums' }),
  standardOnly('42', 'Out-of-pocket health care', 'out_of_pocket_health_care', 'health'),
  l('expenses', 'actual_court_ordered_payments', '43', 'Court-ordered payments', 'money', { allowable_key: 'court_ordered_payments' }),
  l('expenses', 'actual_child_dependent_care', '44', 'Child and dependent care', 'money', { allowable_key: 'child_dependent_care' }),
  l('expenses', 'actual_life_insurance_premiums', '45', 'Life insurance premiums', 'money', { allowable_key: 'life_insurance_premiums' }),
  l('expenses', 'actual_current_taxes', '46', 'Current-year taxes (withholding)', 'money', { allowable_key: 'current_taxes' }),
  l('expenses', 'actual_secured_debts_other', '47', 'Other secured debt payments', 'money', { allowable_key: 'secured_debts_other' }),
  l('expenses', 'actual_delinquent_state_local_tax', '48', 'Delinquent state or local taxes', 'money', { allowable_key: 'delinquent_state_local_tax' }),

  l('assets', 'cash_and_bank_balances', '12-13', 'Cash and bank balances', 'money'),
  l('assets', 'investment_accounts_net', '14', 'Investment accounts, net of loans', 'money'),
  l('assets', 'retirement_accounts_market_value', null, 'Retirement accounts, market value', 'money'),
  l('assets', 'retirement_accounts_loan_balance', null, 'Retirement account loans', 'money'),
  l('assets', 'life_insurance_cash_value', null, 'Life insurance cash value', 'money'),
  l('assets', 'life_insurance_loan_balance', null, 'Life insurance loans', 'money'),
  l('assets', 'real_property_market_value', null, 'Real property, market value', 'money'),
  l('assets', 'real_property_loan_balance', null, 'Real property loans', 'money'),
  l('assets', 'vehicle_count', null, 'Vehicles owned or leased', 'count'),
  l('assets', 'vehicle_market_values', null, 'Vehicle market values (each)', 'money_list'),
  l('assets', 'vehicle_loan_balances', null, 'Vehicle loan balances (each)', 'money_list'),
  l('assets', 'vehicle_market_value_total', null, 'Vehicle market value, total', 'money'),
  l('assets', 'vehicle_loan_balance_total', null, 'Vehicle loan balance, total', 'money'),
  l('assets', 'other_valuable_assets_value', null, 'Other valuable assets, value', 'money'),
  l('assets', 'other_valuable_assets_loan', null, 'Other valuable assets, loans', 'money'),
  l('assets', 'has_real_property', null, 'Owns real estate', 'bool'),
  l('assets', 'has_retirement_accounts', null, 'Has retirement accounts', 'bool'),
  l('assets', 'has_life_insurance_cash_value', null, 'Has life insurance with cash value', 'bool'),
  l('assets', 'has_investment_accounts', null, 'Has investments', 'bool'),

  l('compliance', 'all_returns_filed', null, 'All required returns filed', 'bool'),
  l('compliance', 'in_open_bankruptcy', null, 'In open bankruptcy', 'bool'),
  l('compliance', 'filed_bankruptcy_past_7yrs', null, 'Bankruptcy in the past 7 years', 'bool'),
  l('compliance', 'in_litigation', null, 'Party to a lawsuit', 'bool'),
  l('compliance', 'prior_ia_or_oic_default', null, 'Defaulted on a prior IRS agreement or offer', 'bool'),
  l('compliance', 'filed_and_paid_timely_last_5_years', null, 'Filed and paid on time, last 5 years', 'bool'),
  l('compliance', 'installment_agreement_last_5_years', null, 'Installment agreement in the last 5 years', 'bool'),

  l('liability', 'total_tax_owed', null, 'Total tax owed (with penalties and interest)', 'money'),
  l('liability', 'tax_only_balance', null, 'Tax owed before penalties and interest', 'money'),
  l('liability', 'csed_months_remaining', null, 'Months until the collection statute expires', 'count'),
]

const BY_COLUMN = new Map(LINES.filter((x) => x.column).map((x) => [x.column as string, x]))

export const lineFor = (column: string): LineMeta | undefined => BY_COLUMN.get(column)
export const labelFor = (column: string): string => BY_COLUMN.get(column)?.label ?? column
