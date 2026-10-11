import { describe, expect, it } from 'vitest'
import {
  checkContact,
  contactSchema,
  maskEmail,
  maskPhone,
  normalizePhone,
  suggestDomain,
} from './contact'

describe('suggestDomain', () => {
  it.each([
    ['gmailcom', 'gmail.com'],
    ['gmial.com', 'gmail.com'],
    ['hotmial.com', 'hotmail.com'],
    ['yaho.com', 'yahoo.com'],
    ['outlok.com', 'outlook.com'],
    ['gmail.co', 'gmail.com'],
    ['GMIAL.COM', 'gmail.com'],
  ])('%s → %s', (typo, fix) => {
    expect(suggestDomain(typo)).toBe(fix)
  })

  it('returns null for an exact known domain', () => {
    expect(suggestDomain('gmail.com')).toBeNull()
    expect(suggestDomain('comcast.net')).toBeNull()
  })

  it('returns null for an unknown domain far from every known one', () => {
    expect(suggestDomain('valortax.com')).toBeNull()
  })
})

describe('normalizePhone', () => {
  it('maps every documented format to the same E.164 value', () => {
    for (const p of [
      '(121)121-2121',
      '121-121-2121',
      '1211212121',
      '1 121 121 2121',
      '+11211212121',
      '11211212121',
    ]) {
      expect(normalizePhone(p)?.e164).toBe('+11211212121')
    }
  })

  it('rejects 11 digits without a leading 1, empty, and whitespace', () => {
    expect(normalizePhone('21211212121')).toBeNull()
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone('   ')).toBeNull()
  })
})

describe('checkContact', () => {
  it('reports both empty fields with the empty-field copy', () => {
    expect(checkContact({ email: '', phone: '' })).toEqual({
      ok: false,
      email_error: "Enter the client's email.",
      phone_error: "Enter the client's phone number.",
    })
  })

  it('reports invalid syntax and a short phone', () => {
    expect(
      checkContact({ email: 'not-an-email', phone: '555010' })
    ).toMatchObject({
      ok: false,
      email_error: "That doesn't look like an email address.",
      phone_error: 'Enter a 10-digit US phone number.',
    })
  })

  it('a typo domain blocks with a did-you-mean suggestion', () => {
    const r = checkContact({ email: 'a@gmial.com', phone: '(555) 010-0001' })
    expect(r).toMatchObject({
      ok: false,
      email_suggestion: 'a@gmail.com',
      phone_e164: '+15550100001',
    })
    expect(r.phone_error).toBeUndefined()
    expect(r.email_error).toBeUndefined()
  })

  it('a missing-dot domain keeps the syntax error and still offers the fix', () => {
    expect(
      checkContact({ email: 'a@gmailcom', phone: '5550100001' })
    ).toMatchObject({
      ok: false,
      email_error: "That doesn't look like an email address.",
      email_suggestion: 'a@gmail.com',
    })
  })

  it('a clean contact passes with no suggestion', () => {
    const r = checkContact({ email: 'a@gmail.com', phone: '5550100001' })
    expect(r).toMatchObject({ ok: true, phone_e164: '+15550100001' })
    expect(r.email_suggestion).toBeUndefined()
  })

  it('trims and lowercases the returned email', () => {
    expect(
      checkContact({ email: 'A.B@Example.COM ', phone: '15550100001' })
    ).toMatchObject({
      ok: true,
      email: 'a.b@example.com',
    })
  })
})

describe('contactSchema', () => {
  it('accepts a valid pair and rejects a bad phone', () => {
    expect(
      contactSchema.safeParse({ email: 'x@y.co', phone: '5550100001' }).success
    ).toBe(true)
    expect(
      contactSchema.safeParse({ email: 'x@y.co', phone: '555' }).success
    ).toBe(false)
  })
})

describe('masks', () => {
  it('maskPhone keeps the last four digits', () => {
    expect(maskPhone('+11211212121')).toBe('(•••) •••-2121')
  })

  it('maskEmail keeps the first character and the domain', () => {
    expect(maskEmail('steve1234@hotmail.com')).toBe('s•••@hotmail.com')
    expect(maskEmail('a@b.co')).toBe('a•••@b.co')
  })
})
