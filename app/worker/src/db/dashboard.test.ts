import { describe, expect, it } from 'vitest'
import { clientName, sanitizeQuery } from './dashboard'

describe('sanitizeQuery', () => {
  it('caps the query at 64 characters', () => {
    expect(sanitizeQuery('a'.repeat(100))).toHaveLength(64)
  })

  it("keeps apostrophes, @, dots, dashes and underscores", () => {
    expect(sanitizeQuery("O'Neil")).toBe("O'Neil")
    expect(sanitizeQuery('mary-jo_s@x.com')).toBe('mary-jo_s@x.com')
  })

  it('drops PostgREST filter syntax and collapses spaces', () => {
    expect(sanitizeQuery('  Ann (Smith), ann@x.com ')).toBe('Ann Smith ann@x.com')
    expect(sanitizeQuery('*,or(id.eq.1)')).toBe('orid.eq.1')
  })

  it('is empty for nothing usable', () => {
    expect(sanitizeQuery(undefined)).toBe('')
    expect(sanitizeQuery(' (),* ')).toBe('')
  })
})

describe('clientName', () => {
  it('joins first and last, falls back to email, then Unknown client', () => {
    expect(clientName({ first_name: 'Ann', last_name: 'Lee', email: 'a@x' })).toBe('Ann Lee')
    expect(clientName({ first_name: 'Ann', last_name: null, email: 'a@x' })).toBe('Ann')
    expect(clientName({ first_name: null, last_name: null, email: 'a@x' })).toBe('a@x')
    expect(clientName({ first_name: null, last_name: null, email: null })).toBe('Unknown client')
  })
})
