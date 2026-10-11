import { describe, expect, it } from 'vitest'
import { ExtractError } from '../extract/parse'
import { failReason, mergedRowToProposals } from './extract-proposals'

const REFS = [
  { id: 'd1', name: 'transcript.pdf' },
  { id: 'd2', name: 'auto.pdf' },
]

describe('mergedRowToProposals', () => {
  it('keeps LINES columns only, never the state or county, and rounds money to cents', () => {
    const out = mergedRowToProposals(
      { total_tax_owed: 1234.5000000001, state_of_residence: 'CA', county_of_residence: 'Kern', _kind: 'account', not_a_column: 1 },
      REFS
    )
    expect(out).toEqual([
      {
        canonical_column: 'total_tax_owed',
        proposed_value: 1234.5,
        source_refs: [
          { kind: 'document', id: 'd1', label: 'transcript.pdf' },
          { kind: 'document', id: 'd2', label: 'auto.pdf' },
        ],
        method: 'regex_extract',
        window_start: null,
        window_end: null,
        reliability: 'B',
      },
    ])
  })

  it('rounds each money-list entry and keeps counts, booleans and text as given', () => {
    const out = mergedRowToProposals(
      { vehicle_loan_balances: [1000.004, 2000], vehicle_count: 2, owns_home: false, pay_frequency: 'biweekly' },
      REFS
    )
    expect(Object.fromEntries(out.map((p) => [p.canonical_column, p.proposed_value]))).toEqual({
      vehicle_loan_balances: [1000, 2000],
      vehicle_count: 2,
      owns_home: false,
      pay_frequency: 'biweekly',
    })
  })

  it('drops values of the wrong type instead of failing the whole batch', () => {
    const out = mergedRowToProposals({ total_tax_owed: Number.NaN, vehicle_count: 1.5, owns_home: 'yes', vehicle_market_values: ['x'] }, REFS)
    expect(out).toEqual([])
  })
})

describe('failReason', () => {
  it('maps extractor messages to fixed codes and everything else to unreadable', () => {
    expect(failReason(new ExtractError('No template matched document'))).toBe('no_template')
    expect(failReason(new ExtractError('Missing Account balance'))).toBe('missing_fields')
    expect(failReason(new ExtractError("No amount after 'Total'"))).toBe('missing_fields')
    expect(failReason(new ExtractError("No dollar amount in 'abc'"))).toBe('missing_fields')
    expect(failReason(new ExtractError('Bad date x'))).toBe('unreadable')
    expect(failReason(new Error("KeyError: 'bankruptcy'"))).toBe('unreadable')
  })
})
