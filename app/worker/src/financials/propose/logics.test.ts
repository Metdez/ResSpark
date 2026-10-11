import { describe, expect, it } from 'vitest'
import type { LogicsCaseInfoRow } from '../../integrations/logics/client'
import { ageOn, maritalFromLogics, proposeLogics } from './logics'
import type { ProposeContext } from './run'

const NOW = new Date('2026-10-11T00:00:00Z')
const ctx = (info: Partial<LogicsCaseInfoRow> | null): ProposeContext => ({
  env: {} as Env,
  firmId: 'F1',
  caseId: 'C1',
  caseRow: {},
  settings: { window_months: 3, spouse_employer_ids: [] },
  window: { start: '2026-07-01', end: '2026-09-30', months: 3 },
  now: NOW,
  logicsCaseInfo: async () => (info ? ({ CaseID: 900001, ...info } as LogicsCaseInfoRow) : null),
})

describe('maritalFromLogics', () => {
  it.each([
    ['Married', true],
    [' single ', false],
    ['Divorced', false],
    ['WIDOWED', false],
    ['Separated', null],
    ['', null],
    [undefined, null],
  ])('%j -> %j', (text, want) => {
    expect(maritalFromLogics(text)).toBe(want)
  })
})

describe('ageOn', () => {
  it('counts full years on the job date', () => {
    expect(ageOn('07/24/1980', NOW)).toBe(46)
    expect(ageOn('1980-07-24T00:00:00', NOW)).toBe(46)
  })

  it('a birthday later this year counts one less', () => {
    expect(ageOn('12/01/1980', NOW)).toBe(45)
    expect(ageOn('10/11/1980', NOW)).toBe(46)
  })

  it.each(['13/45/1980', '02/30/1990', '01/01/2030', '01/01/1800', 'soon', ''])('%j is null', (dob) => {
    expect(ageOn(dob, NOW)).toBeNull()
  })
})

describe('proposeLogics', () => {
  it('proposes married, age and liability with field-name refs only', async () => {
    const out = await proposeLogics(ctx({ MaritalStatus: 'Married', DOB: '07/24/1980', TaxLiability: '$18,450.00' }))
    expect(out?.source).toBe('logics')
    const by = Object.fromEntries(out!.proposals.map((p) => [p.canonical_column, p]))
    expect(by.filing_status_married).toMatchObject({ proposed_value: true, reliability: 'A', method: 'logics_marital_status' })
    expect(by.age_taxpayer).toMatchObject({ proposed_value: 46, reliability: 'A', method: 'logics_dob_age' })
    expect(by.total_tax_owed).toMatchObject({ proposed_value: 18450, reliability: 'B', method: 'logics_tax_liability' })
    expect(out!.proposals.map((p) => p.source_refs[0].id)).toEqual(['MaritalStatus', 'DOB', 'TaxLiability'])
    for (const p of out!.proposals) expect(p.source_refs[0].kind).toBe('logics_field')
    const text = JSON.stringify(out)
    expect(text).not.toContain('07/24/1980')
    expect(text).not.toContain('18,450')
  })

  it('blank fields propose nothing (never a default)', async () => {
    expect(await proposeLogics(ctx({ MaritalStatus: '', DOB: '', TaxLiability: '' }))).toEqual({ source: 'logics', proposals: [] })
  })

  it('no Logics case is null', async () => {
    expect(await proposeLogics(ctx(null))).toBeNull()
  })
})
