import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { REQUIRED_FINANCIAL_COLUMNS } from '../engine/financial-data'
import { countyBlock } from './county'
import type { FinancialsCase, ProposalRow } from './db'
import { buildFinancialsView, type FinancialsView, type LineView } from './view'

const golden = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../test/fixtures/engine/golden.json', import.meta.url).href), 'utf8')
) as { cases: Array<{ name: string; row: Record<string, unknown> }> }
const COMPLETE = golden.cases.find((x) => x.name === 'test_complete_database_row_reaches_v2_determination')!.row

const CASE: FinancialsCase = { id: 'C1', logics_case_id: 900001, first_name: 'A', last_name: 'B', financials_settings: {} }

let n = 0
const proposal = (over: Partial<ProposalRow>): ProposalRow => ({
  id: `P${++n}`,
  canonical_column: 'gross_wages_taxpayer',
  proposed_value: 100,
  source: 'plaid',
  source_refs: [],
  method: 'm',
  window_start: null,
  window_end: null,
  reliability: 'B',
  status: 'proposed',
  decided_by: null,
  decided_at: null,
  created_at: '2026-10-11T00:00:00Z',
  ...over,
})

const WAITING = countyBlock({}, null, null)
const EMPLOYERS = [
  { employer_id: 'emp_1', connection_id: 'K1', company_name: 'Acme', status: 'done' },
  { employer_id: 'emp_2', connection_id: 'K1', company_name: null, status: 'pending' },
]
const build = (row: Record<string, unknown> | null, proposals: ProposalRow[] = [], settings = {}) =>
  buildFinancialsView({
    caseRow: { ...CASE, financials_settings: settings },
    row,
    proposals,
    staffNames: { S1: 'Sandra' },
    standardsVersion: null,
    county: WAITING,
    employers: EMPLOYERS,
    now: new Date('2026-10-11T12:00:00Z'),
  })
const line = (view: FinancialsView, column: string | null, label?: string): LineView =>
  view.sections.flatMap((s) => s.lines).find((l) => l.column === column && (!label || l.label === label))!

describe('buildFinancialsView', () => {
  it('shows competing proposed rows side by side', () => {
    const view = build({ ...COMPLETE, gross_wages_taxpayer: null }, [
      proposal({ source: 'plaid' }),
      proposal({ source: 'intake', proposed_value: 120 }),
    ])
    const l = line(view, 'gross_wages_taxpayer')
    expect(l.status).toBe('proposed')
    expect(l.value).toBeNull()
    expect(l.proposals.map((p) => p.source)).toEqual(['plaid', 'intake'])
  })

  it('a value with no proposals at all needs data when null', () => {
    expect(line(build({ ...COMPLETE, gross_wages_taxpayer: null }), 'gross_wages_taxpayer').status).toBe('needs_data')
  })

  it('a set value whose latest decided row is edited is edited, with that decider', () => {
    const view = build(COMPLETE, [
      proposal({ id: 'OLD', status: 'accepted', decided_by: 'S1', decided_at: '2026-10-10T00:00:00Z' }),
      proposal({ id: 'NEW', status: 'edited', source: 'truv', decided_by: 'S1', decided_at: '2026-10-11T00:00:00Z' }),
      proposal({ id: 'REJ', status: 'rejected', decided_by: 'S1', decided_at: '2026-10-12T00:00:00Z' }),
    ])
    const l = line(view, 'gross_wages_taxpayer')
    expect(l.status).toBe('edited')
    expect(l.confirmed).toEqual({ proposal_id: 'NEW', source: 'truv', by_name: 'Sandra', at: '2026-10-11T00:00:00Z' })
  })

  it('a set value with no decided row is confirmed with a null source', () => {
    const l = line(build(COMPLETE), 'gross_wages_taxpayer')
    expect(l.status).toBe('confirmed')
    expect(l.value).toBe(6800)
    expect(l.confirmed).toEqual({ proposal_id: null, source: null, by_name: null, at: null })
  })

  it('counts every required column plus the five question-only columns', () => {
    const view = build(COMPLETE)
    expect(view.required).toEqual({ confirmed: REQUIRED_FINANCIAL_COLUMNS.length + 5, total: 63, missing: [] })
  })

  it('lists missing facts sorted and counts the rest as confirmed', () => {
    const view = build({ ...COMPLETE, vehicle_count: null, age_taxpayer: null, has_real_property: null })
    expect(view.required).toEqual({ confirmed: 60, total: 63, missing: ['age_taxpayer', 'has_real_property', 'vehicle_count'] })
  })

  it('an absent row is all missing', () => {
    expect(build(null).required).toMatchObject({ confirmed: 0, total: 63 })
  })

  it('standard-only expense lines have status standard and no column', () => {
    const view = build(COMPLETE)
    for (const label of ['Food, clothing and miscellaneous', 'Out-of-pocket health care']) {
      expect(line(view, null, label)).toMatchObject({ status: 'standard', column: null, value: null, proposals: [] })
    }
  })

  it('settings default to a 3-month window and accept 6', () => {
    expect(build(COMPLETE).settings).toEqual({ window_months: 3, spouse_employer_ids: [] })
    expect(build(COMPLETE, [], { window_months: 6, spouse_employer_ids: ['E1', 7] }).settings).toEqual({
      window_months: 6,
      spouse_employer_ids: ['E1'],
    })
  })

  it('keeps the seven sections in order', () => {
    expect(build(COMPLETE).sections.map((s) => s.id)).toEqual([
      'household', 'employment', 'income', 'expenses', 'assets', 'compliance', 'liability',
    ])
  })

  it('window follows the settings; spouse employer ids mark the person', () => {
    const view = build(COMPLETE, [], { window_months: 6, spouse_employer_ids: ['emp_2'] })
    expect(view.window).toEqual({ start: '2026-04-01', end: '2026-09-30', months: 6 })
    expect(view.county.status).toBe('waiting_for_address')
    expect(view.employers.map((e) => [e.employer_id, e.person])).toEqual([['emp_1', 'taxpayer'], ['emp_2', 'spouse']])
  })
})
