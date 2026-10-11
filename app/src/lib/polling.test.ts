import { describe, expect, it } from 'vitest'
import { pollInterval } from './polling'

describe('pollInterval', () => {
  it.each([
    ['success', 5000],
    ['pending', 5000],
    ['error', 30000],
  ])('%s → %i ms', (status, ms) => {
    expect(pollInterval({ state: { status } })).toBe(ms)
  })
})
