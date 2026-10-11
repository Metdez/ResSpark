import { describe, expect, it } from 'vitest'
import { isUsStateCode, US_STATES } from './us-states'

describe('US_STATES', () => {
  it('has 51 unique codes (50 states + DC)', () => {
    expect(US_STATES).toHaveLength(51)
    expect(new Set(US_STATES.map((s) => s.code)).size).toBe(51)
  })

  it('includes DC and WY and excludes PR', () => {
    expect(isUsStateCode('DC')).toBe(true)
    expect(isUsStateCode('WY')).toBe(true)
    expect(isUsStateCode('PR')).toBe(false)
  })

  it('accepts uppercase codes only', () => {
    expect(isUsStateCode('ca')).toBe(false)
    expect(isUsStateCode(42)).toBe(false)
  })

  it('is sorted by name', () => {
    const names = US_STATES.map((s) => s.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })
})
