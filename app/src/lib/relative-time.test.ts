import { describe, expect, it } from 'vitest'
import { ago, minutesSince } from './relative-time'

const now = Date.parse('2026-10-11T12:00:00Z')
const at = (ms: number) => new Date(now - ms).toISOString()
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('ago', () => {
  it.each([
    [10_000, 'just now'],
    [5 * MIN, '5 min ago'],
    [3 * HOUR, '3 h ago'],
    [2 * DAY, '2 d ago'],
    [-13 * DAY, 'in 13 d'],
  ])('%i ms before now → %s', (ms, text) => {
    expect(ago(at(ms), now)).toBe(text)
  })

  it('renders a dash for a missing time', () => {
    expect(ago(null)).toBe('—')
    expect(ago(undefined)).toBe('—')
  })
})

describe('minutesSince', () => {
  it('floors to whole minutes', () => {
    expect(minutesSince(at(11 * MIN), now)).toBe(11)
    expect(minutesSince(at(30_000), now)).toBe(0)
  })
})
