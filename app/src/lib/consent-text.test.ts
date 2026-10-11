import { describe, expect, it } from 'vitest'
import { CONSENT_TEXT, consentKindForItem } from './consent-text'

describe('CONSENT_TEXT', () => {
  const esign = CONSENT_TEXT.esign

  it('esign is version esign-v1 with five points', () => {
    expect(esign.version).toBe('esign-v1')
    expect(esign.points).toHaveLength(5)
  })

  it('esign carries the 15 U.S.C. 7001(c)(1) disclosures', () => {
    const text = esign.points!.join(' ')
    for (const phrase of ['paper copy', 'no fee', 'take back', 'paper forms', 'through this link', 'email address or phone number changes', 'up-to-date web browser', 'PDF'])
      expect(text).toContain(phrase)
  })

  it('maps item kinds to consent kinds', () => {
    expect(consentKindForItem('bank_connect')).toBe('bank_data')
    expect(consentKindForItem('payroll_connect')).toBe('payroll_data')
    expect(consentKindForItem('signature')).toBe('esign')
  })

  it('no string has an exclamation mark, a vendor name, or the word token', () => {
    const all = Object.values(CONSENT_TEXT).flatMap((t) => [t.title, t.body, t.detail, t.agree, ...(t.points ?? [])])
    for (const s of all) expect(s).not.toMatch(/!|DocuSeal|token/i)
  })
})
