import { describe, expect, it } from 'vitest'
import { formatDay, formatMoney, formatValue, parseInputValue } from './format'

describe('financials format', () => {
  it('formats money, unknowns, booleans and lists', () => {
    expect(formatMoney(1234.5)).toBe('$1,234.50')
    expect(formatValue('money', null)).toBe('Needs data')
    expect(formatValue('money', 0)).toBe('$0.00')
    expect(formatValue('bool', true)).toBe('Yes')
    expect(formatValue('bool', false)).toBe('No')
    expect(formatValue('money_list', [10000, 5000.5])).toBe('$10,000.00, $5,000.50')
    expect(formatDay('2026-06-29')).toBe('Jun 29, 2026')
  })

  it('parses kind-specific input', () => {
    expect(parseInputValue('money', '$1,200.505').ok).toBe(false)
    expect(parseInputValue('money', '$1,200.50')).toEqual({ ok: true, value: 1200.5 })
    expect(parseInputValue('count', '3')).toEqual({ ok: true, value: 3 })
    expect(parseInputValue('count', '3.5').ok).toBe(false)
    expect(parseInputValue('money_list', '10000, 5000.50')).toEqual({ ok: true, value: [10000, 5000.5] })
    expect(parseInputValue('bool', 'No')).toEqual({ ok: true, value: false })
    expect(parseInputValue('text', '  ').ok).toBe(false)
  })
})
