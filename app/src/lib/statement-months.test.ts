import { describe, expect, it } from 'vitest'
import { isInWindow, monthLabel, STANDARD_MONTHS, STATEMENT_MONTHS, targetMonths } from './statement-months'

const now = new Date('2026-10-10T12:00:00Z')

describe('statement months', () => {
  it('six months newest first, starting with the month before now', () => {
    expect(targetMonths(now, 6)).toEqual([
      { year: 2026, month: 9 },
      { year: 2026, month: 8 },
      { year: 2026, month: 7 },
      { year: 2026, month: 6 },
      { year: 2026, month: 5 },
      { year: 2026, month: 4 },
    ])
    expect(targetMonths(now)).toHaveLength(STATEMENT_MONTHS)
    expect(STANDARD_MONTHS).toBe(3)
  })

  it('rolls over January into the previous year', () => {
    expect(targetMonths(new Date('2026-01-15'), 3)).toEqual([
      { year: 2025, month: 12 },
      { year: 2025, month: 11 },
      { year: 2025, month: 10 },
    ])
  })

  it('the window edge is inclusive', () => {
    expect(isInWindow({ year: 2026, month: 4 }, now, 6)).toBe(true)
    expect(isInWindow({ year: 2026, month: 9 }, now, 6)).toBe(true)
    expect(isInWindow({ year: 2026, month: 3 }, now, 6)).toBe(false)
    expect(isInWindow({ year: 2026, month: 10 }, now, 6)).toBe(false)
  })

  it('labels a month', () => {
    expect(monthLabel(2026, 3)).toBe('Mar 2026')
    expect(monthLabel(2025, 12)).toBe('Dec 2025')
  })
})
