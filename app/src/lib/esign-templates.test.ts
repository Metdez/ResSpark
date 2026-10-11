import { describe, expect, it } from 'vitest'
import { ESIGN_TEMPLATE_KEYS, ESIGN_TEMPLATE_LABELS, IRS_ONLINE_NOTE, isEsignTemplateKey } from './esign-templates'

describe('esign templates', () => {
  it('lists the three signable keys in order, each with a label', () => {
    expect(ESIGN_TEMPLATE_KEYS).toEqual(['engagement_letter', 'form_2848', 'form_8821'])
    for (const k of ESIGN_TEMPLATE_KEYS) expect(ESIGN_TEMPLATE_LABELS[k]).toBeTruthy()
  })

  it('rejects every other value (D-01)', () => {
    for (const v of ['form_433a', 'form_656', '', null, undefined, 1]) expect(isEsignTemplateKey(v)).toBe(false)
    expect(isEsignTemplateKey('form_8821')).toBe(true)
  })

  it('has IRS notes only for the IRS forms; 2848 names Part II', () => {
    expect(IRS_ONLINE_NOTE.engagement_letter).toBeUndefined()
    expect(IRS_ONLINE_NOTE.form_8821).toContain('IRS.gov/Submit8821')
    expect(IRS_ONLINE_NOTE.form_2848).toContain('Part II')
  })
})
