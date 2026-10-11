import type { FinancialsView, LineView, ProposalView, RunView } from './api'

// Shared web-test data for features/financials: one line per behaviour, sections in D-14 order.
export const proposal = (id: string, source: string, value: unknown): ProposalView => ({
  id,
  source,
  proposed_value: value,
  method: `${source}_method`,
  window_start: '2026-07-01',
  window_end: '2026-09-30',
  reliability: 'A',
  source_refs: [],
  created_at: '2026-10-11T08:00:00Z',
})

export const line = (over: Partial<LineView> & { column: string | null }): LineView => ({
  section: 'income',
  line: null,
  label: over.column ?? 'Standard line',
  kind: 'money',
  required: true,
  na_rule: null,
  value: null,
  status: 'needs_data',
  confirmed: null,
  proposals: [],
  ...over,
})

const confirmed = (source: string, by_name: string | null = null) => ({ proposal_id: 'X', source, by_name, at: '2026-10-11T09:00:00Z' })

export const P1 = '11111111-1111-4111-8111-111111111111'
export const P2 = '22222222-2222-4222-8222-222222222222'
export const P3 = '33333333-3333-4333-8333-333333333333'

export function makeView(over: Partial<Record<string, Partial<LineView>>> = {}): FinancialsView {
  const sections: FinancialsView['sections'] = [
    { id: 'household', title: 'Household', lines: [
      line({ column: 'filing_status_married', section: 'household', label: 'Married', kind: 'bool', value: false, status: 'confirmed', confirmed: confirmed('intake') }),
      line({ column: 'age_spouse', section: 'household', label: 'Spouse age', kind: 'count', na_rule: 'not_married' }),
      line({ column: 'owns_home', section: 'household', label: 'Owns home', kind: 'bool', value: false, status: 'confirmed', confirmed: confirmed('intake') }),
      line({ column: 'rents_home', section: 'household', label: 'Rents home', kind: 'bool', na_rule: 'owns_home' }),
    ] },
    { id: 'employment', title: 'Employment', lines: [
      line({ column: 'is_wage_earner', section: 'employment', label: 'Receives W-2 wages', kind: 'bool', value: true, status: 'confirmed', confirmed: confirmed('truv') }),
      line({ column: 'pay_frequency', section: 'employment', label: 'Pay frequency', kind: 'text', na_rule: 'not_wage_earner' }),
    ] },
    { id: 'income', title: 'Monthly income', lines: [
      line({ column: 'gross_wages_taxpayer', line: '21', label: 'Gross wages, taxpayer', status: 'proposed', proposals: [proposal(P1, 'plaid', 1500), proposal(P2, 'intake', 1400)] }),
      line({ column: 'interest_dividends_royalties', line: '23', label: 'Interest, dividends and royalties', status: 'proposed', proposals: [proposal(P3, 'plaid', 12.5)] }),
      line({ column: 'pension_income', line: '27-28', label: 'Pension income', value: 0, status: 'confirmed', confirmed: confirmed('intake') }),
    ] },
    { id: 'expenses', title: 'Monthly expenses', lines: [
      line({ column: null, section: 'expenses', line: '36', label: 'Food, clothing and miscellaneous', required: false, status: 'standard', allowable_key: 'food_clothing_misc', standard_key: 'national' }),
      line({ column: 'actual_housing_utilities', section: 'expenses', line: '37', label: 'Housing and utilities', value: 2100, status: 'edited', confirmed: confirmed('staff', 'Test agent'), allowable_key: 'housing_utilities', standard_key: 'housing' }),
    ] },
    { id: 'assets', title: 'Assets', lines: [line({ column: 'cash_and_bank_balances', section: 'assets', line: '12-13', label: 'Cash and bank balances' })] },
    { id: 'compliance', title: 'Compliance', lines: [
      line({ column: 'all_returns_filed', section: 'compliance', label: 'All required returns filed', kind: 'bool', value: true, status: 'confirmed', confirmed: confirmed('logics') }),
    ] },
    { id: 'liability', title: 'Tax liability', lines: [
      line({ column: 'total_tax_owed', section: 'liability', label: 'Total tax owed (with penalties and interest)', value: 12345.67, status: 'confirmed', confirmed: confirmed('logics') }),
    ] },
  ]
  for (const s of sections) s.lines = s.lines.map((l) => ({ ...l, ...over[l.column ?? ''] }))
  return {
    case: { id: 'C1', logics_case_id: 900001, first_name: 'Jordan', last_name: 'Rivera' },
    settings: { window_months: 3, spouse_employer_ids: [] },
    window: { start: '2026-07-01', end: '2026-09-30', months: 3 },
    county: { status: 'waiting_for_address', state_code: null, county_fips: null, smarty_county: null, irs_county: null, address_source: null, address_verified: false },
    employers: [],
    standards_version: { effective_date: '2026-06-29', source_url: 'https://www.irs.gov/' },
    required: { confirmed: 12, total: 64, missing: [] },
    sections,
  }
}

export const RUN: RunView = {
  id: 'run1',
  created_at: '2026-10-11T10:00:00Z',
  status: 'ready_for_review',
  path: 'Simple Payment Plan',
  reason: 'Balance is under $50,000 and can be paid within the collection statute.',
  outcome: { id: 'simple_plan', label: 'Simple payment plan' },
  next: 'A tax professional must review this result before anything is filed.',
  monthly_income: 5200,
  monthly_expenses: 4100.25,
  net_disposable_income: 1099.75,
  net_realizable_equity: 2500,
  suggested_offer_or_payment: 1234.57,
  needs_manual_review: false,
  review_flags: ['Pay stubs older than 60 days'],
  allowable_breakdown: { food_clothing_misc: 1000, housing_utilities: 1900, total: 4100.25 },
  nre_lines: [
    { key: 'cash', label: 'Cash and bank, less the $1,000 reserve — 433-A(OIC) line 1', value: 2500 },
    { key: 'investments', label: 'Investment accounts, net of loans — 433-A(OIC) line 2', value: 0 },
    { key: 'retirement', label: 'Retirement accounts × 0.8, less loans — 433-A(OIC) line 3', value: 0 },
    { key: 'life_insurance', label: 'Life-insurance cash value, less loans — 433-A(OIC) line 4', value: 0 },
    { key: 'real_property', label: 'Real property × 0.8, less loans — 433-A(OIC) line 5', value: 0 },
    { key: 'vehicles', label: 'Vehicles × 0.8, less loans and the $3,450 exemption — 433-A(OIC) line 6', value: 0 },
    { key: 'other_assets', label: 'Other valuable assets × 0.8, less loans and $11,980 — 433-A(OIC) line 7', value: 0 },
  ],
  standards_inputs: { state: 'CA', county: 'Los Angeles', household_size: 2, vehicle_count: 1, national: 1000, housing: 2300, ownership: 600, operating: 300, health_under_65: 84, health_65_plus: 149, transportation_area: 'Los Angeles' },
  standards_effective_date: '2026-06-29',
  engine_version: 'ts-1',
  payment_math: { total_tax_owed: 12345.67, csed_months_used: 10 },
  created_by_name: 'Test agent',
}
