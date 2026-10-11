import { describe, expect, it } from 'vitest'
import { completeMonthsWindow } from './window'

describe('completeMonthsWindow', () => {
  it('3 months ends on the last day of the previous month', () => {
    expect(completeMonthsWindow(new Date('2026-10-11T12:00:00Z'), 3)).toEqual({ start: '2026-07-01', end: '2026-09-30', months: 3 })
  })

  it('6 months starts six months back', () => {
    expect(completeMonthsWindow(new Date('2026-10-11T12:00:00Z'), 6)).toEqual({ start: '2026-04-01', end: '2026-09-30', months: 6 })
  })

  it('crosses the year boundary', () => {
    expect(completeMonthsWindow(new Date('2026-01-01T00:00:00Z'), 3)).toEqual({ start: '2025-10-01', end: '2025-12-31', months: 3 })
  })

  it('handles a leap February', () => {
    expect(completeMonthsWindow(new Date('2028-03-31T23:59:59Z'), 3).end).toBe('2028-02-29')
  })
})
