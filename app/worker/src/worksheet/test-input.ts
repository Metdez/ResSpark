// Unit-test input for the worksheet: the golden complete row and a simple-plan run built from it.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { NRE_LINE_KEYS, NRE_LINE_LABELS } from '../engine/determination'
import { NEXT_STEP } from '../engine/outcome'
import type { RunView } from '../financials/evaluate'
import type { WorksheetInput } from './layout'

const golden = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../test/fixtures/engine/golden.json', import.meta.url).href), 'utf8')
) as { cases: Array<{ name: string; row: Record<string, unknown>; expected: { allowable_breakdown: Record<string, number> } }> }

const COMPLETE = golden.cases.find((x) => x.name === 'test_complete_database_row_reaches_v2_determination')!

export const sampleRun = (over: Partial<RunView> = {}): RunView => ({
  id: '11111111-1111-4111-8111-111111111111',
  created_at: '2026-10-11T16:00:00.000Z',
  status: 'ready',
  path: 'Simple Payment Plan',
  reason: 'The balance can be paid in full before the collection statute expires.',
  outcome: { id: 'simple_plan', label: 'Simple payment plan' },
  next: NEXT_STEP,
  monthly_income: 6800,
  monthly_expenses: 5528,
  net_disposable_income: 1272,
  net_realizable_equity: 5400,
  suggested_offer_or_payment: 311.12,
  needs_manual_review: false,
  review_flags: [],
  allowable_breakdown: COMPLETE.expected.allowable_breakdown,
  nre_lines: NRE_LINE_KEYS.map((key, i) => ({ key, label: NRE_LINE_LABELS[key], value: i * 100 })),
  standards_inputs: {
    state: 'FL',
    county: 'Miami-Dade County',
    household_size: 2,
    vehicle_count: 1,
    national: 1558,
    health_under_65: 84,
    health_65_plus: 149,
    transportation_area: 'South',
    ownership: 662,
    operating: 350,
    housing: 2400,
  },
  standards_effective_date: '2026-04-20',
  engine_version: 'ts-port-2',
  payment_math: { total_tax_owed: 28000, csed_months_used: 90 },
  created_by_name: 'Test agent',
  ...over,
})

export const sampleInput = (over: Partial<WorksheetInput> = {}): WorksheetInput => ({
  firm_name: 'ValorTax (test)',
  client_name: 'Marcus Delgado',
  logics_case_id: 900001,
  run: sampleRun(),
  snapshot: { ...COMPLETE.row },
  sources: {
    cash_and_bank_balances: { source: 'plaid', status: 'accepted', by_name: 'Test agent' },
    household_size: { source: 'staff', status: 'edited', by_name: null },
    actual_housing_utilities: { source: 'plaid', status: 'accepted', by_name: null },
  },
  standards: { effective_date: '2026-04-20', source_url: 'https://www.irs.gov/businesses/small-businesses-self-employed/collection-financial-standards' },
  generated_at: '2026-10-11T17:00:00.000Z',
  ...over,
})
