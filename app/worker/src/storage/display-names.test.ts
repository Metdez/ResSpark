import { describe, expect, it } from 'vitest'
import { INCOME_REPORT_DISPLAY_NAME, longDate, payStubDisplayName, statementDisplayName, w2DisplayName } from './display-names'

const FORBIDDEN = /[/\\:*?"<>|]/

describe('longDate', () => {
  it('spells out an ISO date without a timezone shift', () => {
    expect(longDate('2026-10-12')).toBe('October 12, 2026')
    expect(longDate('2026-01-01')).toBe('January 1, 2026')
    expect(longDate('2025-12-31')).toBe('December 31, 2025')
  })
  it('returns anything that is not YYYY-MM-DD unchanged', () => {
    for (const s of ['undated', '2026-9-1', '10/12/2026', '2026-13-01', '']) expect(longDate(s)).toBe(s)
  })
})

describe('statementDisplayName', () => {
  it('names the month and year, with the account mask when there is one', () => {
    expect(statementDisplayName(2026, 9, '1234')).toBe('Bank statement - September 2026 - x1234.pdf')
    expect(statementDisplayName(2026, 9, null)).toBe('Bank statement - September 2026.pdf')
  })
})

describe('payStubDisplayName', () => {
  it('spells out the pay date and adds the check number when there is one', () => {
    expect(payStubDisplayName('2026-10-12', null)).toBe('Pay stub - October 12, 2026.pdf')
    expect(payStubDisplayName('2026-10-12', '1001')).toBe('Pay stub - October 12, 2026 - check 1001.pdf')
  })
  it('keeps only letters, digits and dashes of the check number', () => {
    expect(payStubDisplayName('2026-10-12', 'CK/10:01?')).toBe('Pay stub - October 12, 2026 - check CK1001.pdf')
    expect(payStubDisplayName('2026-10-12', '/:*')).toBe('Pay stub - October 12, 2026.pdf')
  })
  it('reads undated without a pay date', () => {
    expect(payStubDisplayName(null, null)).toBe('Pay stub - undated.pdf')
    expect(payStubDisplayName(null, '7')).toBe('Pay stub - undated - check 7.pdf')
  })
  it('drops Windows-forbidden characters from a pay date that is not ISO', () => {
    expect(payStubDisplayName('10/12/2026', null)).toBe('Pay stub - 10122026.pdf')
  })
})

describe('w2DisplayName / INCOME_REPORT_DISPLAY_NAME', () => {
  it('names the W-2 by year and the income report by a fixed name', () => {
    expect(w2DisplayName(2025)).toBe('W-2 - 2025.pdf')
    expect(w2DisplayName('unknown')).toBe('W-2 - unknown.pdf')
    expect(INCOME_REPORT_DISPLAY_NAME).toBe('Income report.pdf')
  })
})

describe('Windows-safe names', () => {
  it('no helper emits / \\ : * ? " < > |', () => {
    const names = [
      statementDisplayName(2026, 9, 'x/y:z'),
      statementDisplayName(2026, 13, null),
      payStubDisplayName('a<b>|c', '"q"'),
      w2DisplayName('20*25'),
      INCOME_REPORT_DISPLAY_NAME,
    ]
    for (const n of names) expect(n).not.toMatch(FORBIDDEN)
  })
})
