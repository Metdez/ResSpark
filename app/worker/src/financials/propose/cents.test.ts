import { describe, expect, it } from 'vitest'
import { centsToNumber, divHalfUp, parseMoney, toCents } from './cents'

describe('toCents', () => {
  it('is exact for up to two decimals', () => {
    expect(toCents('2650.00')).toBe(265000)
    expect(toCents('-12.5')).toBe(-1250)
    expect(toCents('$1,234.5')).toBe(123450)
    expect(toCents(42)).toBe(4200)
  })

  it('throws on more than two decimals or junk', () => {
    expect(() => toCents('1.005')).toThrow('bad_money')
    expect(() => toCents('abc')).toThrow('bad_money')
    expect(() => toCents('')).toThrow('bad_money')
  })
})

describe('divHalfUp', () => {
  it('rounds half away from zero', () => {
    expect(divHalfUp(5, 2)).toBe(3)
    expect(divHalfUp(-5, 2)).toBe(-3)
    expect(divHalfUp(4, 2)).toBe(2)
    expect(divHalfUp(0, 7)).toBe(0)
  })

  it('biweekly gross to monthly', () => {
    expect(divHalfUp(530000 * 26, 2 * 12)).toBe(574167)
  })
})

describe('parseMoney', () => {
  it('parses Logics money text', () => {
    expect(parseMoney('$18,450.00')).toBe(1845000)
    expect(centsToNumber(1845000)).toBe(18450)
  })

  it.each(['', '   ', 'abc', '-5', '1.005'])('%j is null', (text) => {
    expect(parseMoney(text)).toBeNull()
  })

  it('null and undefined are null', () => {
    expect(parseMoney(null)).toBeNull()
    expect(parseMoney(undefined)).toBeNull()
  })
})
