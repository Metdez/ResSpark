import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { likeToRegExp, payFrequencyAnswer, payrollProposals, periodsPerYear, proposePayroll, type DeductionMapRow } from './payroll'
import type { ProposeContext } from './run'

// Query results for the mocked admin client, in call order.
const results: Array<{ data: unknown; error: null }> = []
vi.mock('../../db/client', () => ({
  createAdminClient: () => {
    const q: Record<string, unknown> = {}
    for (const m of ['from', 'select', 'eq', 'neq', 'order']) q[m] = () => q
    q.then = (resolve: (v: unknown) => void) => resolve(results.shift())
    return q
  },
}))

const FIXTURE = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../test/fixtures/truv/income_report_proposals.json', import.meta.url)), 'utf8')
) as { employers: Record<string, unknown>[] }
// Mirrors the 0009 seed rows (test data; the code never names a category).
const row = (truv_category: string, name_pattern: string, canonical_column: string | null, reliability: 'A' | 'B' | 'C' | null): DeductionMapRow => ({
  truv_category,
  name_pattern,
  treatment: canonical_column ? 'expense' : 'informational',
  canonical_column,
  reliability,
})
const MAP: DeductionMapRow[] = [
  ...['federal', 'state', 'local', 'socialsec', 'medicare'].map((c) => row(c, '%', 'actual_current_taxes', 'A')),
  row('garnishment', '%', 'actual_court_ordered_payments', 'B'),
  row('benefit', '%health%', 'actual_health_insurance_premiums', 'B'),
  row('benefit', '%medical%', 'actual_health_insurance_premiums', 'B'),
  row('benefit', '%life%', 'actual_life_insurance_premiums', 'C'),
  row('benefit', '%', null, null),
  row('retirement', '%', null, null),
]
const WINDOW = { start: '2026-07-01', end: '2026-09-30' }
const CONN = (employers = FIXTURE.employers) => [{ id: 'conn1', data: { employers } }]
const run = (spouse: string[] = [], employers = FIXTURE.employers) => payrollProposals(CONN(employers), MAP, WINDOW, spouse)!
const col = (out: ReturnType<typeof run>, c: string) => out.find((p) => p.canonical_column === c)

describe('pay frequency codes', () => {
  it('maps W, BW, SM, M; A, SA, C and missing give null', () => {
    expect([periodsPerYear('BW'), periodsPerYear('SM'), periodsPerYear('W'), periodsPerYear('M')]).toEqual([26, 24, 52, 12])
    expect([periodsPerYear('A'), periodsPerYear('SA'), periodsPerYear('C'), periodsPerYear(undefined)]).toEqual([null, null, null, null])
    expect(payFrequencyAnswer('SM')).toBe('semimonthly')
    expect(payFrequencyAnswer('toString')).toBeNull()
  })
})

describe('likeToRegExp (ILIKE)', () => {
  it('handles %, _, case and escapes', () => {
    expect(likeToRegExp('%health%').test('Medical HEALTH PPO')).toBe(true)
    expect(likeToRegExp('%').test('')).toBe(true)
    expect(likeToRegExp('a_c').test('abc')).toBe(true)
    expect(likeToRegExp('a_c').test('abbc')).toBe(false)
    expect(likeToRegExp('50%+').test('50 pct+')).toBe(true)
    expect(likeToRegExp('50%+').test('50 pct')).toBe(false)
    expect(likeToRegExp('100\\%').test('100%')).toBe(true)
    expect(likeToRegExp('100\\%').test('1000')).toBe(false)
  })
})

describe('payrollProposals', () => {
  it('both employers on the taxpayer: wages 9341.67, deductions by map row, no pay_frequency', () => {
    const out = run()
    expect(col(out, 'gross_wages_taxpayer')).toMatchObject({
      proposed_value: 9341.67,
      method: 'mean_gross_pay_x_periods_div_12',
      reliability: 'A',
      window_start: '2026-07-01',
      window_end: '2026-09-30',
    })
    expect(col(out, 'gross_wages_spouse')).toBeUndefined()
    // Acme: 51273 x 3 x 26 / 36 = 111091.5 -> 111092; Beta: 15000 x 2 x 24 / 24 = 30000.
    expect(col(out, 'actual_current_taxes')).toMatchObject({ proposed_value: 1410.92, reliability: 'A', method: 'mean_deduction_x_periods_div_12' })
    expect(col(out, 'actual_health_insurance_premiums')).toMatchObject({ proposed_value: 260, reliability: 'B' })
    expect(col(out, 'actual_life_insurance_premiums')).toMatchObject({ proposed_value: 17.33, reliability: 'C' })
    expect(col(out, 'actual_court_ordered_payments')).toMatchObject({ proposed_value: 433.33, reliability: 'B' })
    expect(col(out, 'is_wage_earner')).toMatchObject({ proposed_value: true, reliability: 'A', method: 'truv_employment_with_stubs' })
    expect(col(out, 'pay_frequency')).toBeUndefined()
    // The 401k is informational, and the June stub is outside the window.
    expect(out.map((p) => p.canonical_column).sort()).toEqual(
      ['actual_court_ordered_payments', 'actual_current_taxes', 'actual_health_insurance_premiums', 'actual_life_insurance_premiums', 'gross_wages_taxpayer', 'is_wage_earner'].sort()
    )
    expect(col(out, 'gross_wages_taxpayer')!.source_refs).toHaveLength(5)
    expect(col(out, 'gross_wages_taxpayer')!.source_refs[0]).toEqual({ kind: 'pay_stub', id: 'conn1:emp_1:2026-09-18:3003', label: 'Acme Inc · 2026-09-18' })
    expect(col(out, 'gross_wages_taxpayer')!.source_refs.map((r) => r.id)).toContain('conn1:emp_2:2026-08-31')
  })

  it('emp_2 on the spouse: taxpayer 5741.67, spouse 3600, pay_frequency biweekly', () => {
    const out = run(['emp_2'])
    expect(col(out, 'gross_wages_taxpayer')!.proposed_value).toBe(5741.67)
    expect(col(out, 'gross_wages_spouse')!.proposed_value).toBe(3600)
    expect(col(out, 'pay_frequency')).toMatchObject({ proposed_value: 'biweekly', method: 'truv_pay_frequency', reliability: 'A' })
  })

  it('an annual (A) employment gives no wage proposal', () => {
    const annual = structuredClone(FIXTURE.employers) as Array<{ report: { employments: Array<{ pay_frequency: string }> } }>
    annual[1].report.employments[0].pay_frequency = 'A'
    const out = run([], annual as unknown as Record<string, unknown>[])
    expect(col(out, 'gross_wages_taxpayer')!.proposed_value).toBe(5741.67)
    expect(col(out, 'pay_frequency')!.proposed_value).toBe('biweekly')
  })

  it('a malformed amount skips that employment', () => {
    const bad = structuredClone(FIXTURE.employers) as Array<{ report: { employments: Array<{ statements: Array<{ gross_pay: string }> }> } }>
    bad[0].report.employments[0].statements[0].gross_pay = 'n/a'
    expect(col(run([], bad as unknown as Record<string, unknown>[]), 'gross_wages_taxpayer')!.proposed_value).toBe(3600)
  })

  it('no fetched report anywhere -> null', () => {
    expect(payrollProposals([{ id: 'c', data: { employers: [{ employer_id: 'emp_1', status: 'pending' }] } }], MAP, WINDOW, [])).toBeNull()
  })
})

describe('proposePayroll', () => {
  const ctx = { env: {}, firmId: 'F', caseId: 'C', window: { ...WINDOW, months: 3 }, settings: { window_months: 3, spouse_employer_ids: [] } } as unknown as ProposeContext

  it('no payroll connection -> []', async () => {
    results.push({ data: [], error: null })
    expect(await proposePayroll(ctx)).toEqual({ source: 'truv', proposals: [] })
  })

  it('connections without a report -> null', async () => {
    results.push({ data: [{ id: 'c', data: { employers: [] } }], error: null }, { data: MAP, error: null })
    expect(await proposePayroll(ctx)).toBeNull()
  })

  it('reads the map and proposes', async () => {
    results.push({ data: CONN(), error: null }, { data: MAP, error: null })
    const out = await proposePayroll(ctx)
    expect(out!.source).toBe('truv')
    expect(col(out!.proposals, 'gross_wages_taxpayer')!.proposed_value).toBe(9341.67)
  })
})
