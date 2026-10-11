import { describe, expect, it } from 'vitest'
import { isEsignSettings } from './esign-api'

const OK = {
  configured: true,
  env: 'test',
  mapping: { engagement_letter: 1001, form_2848: null, form_8821: null },
}

describe('isEsignSettings', () => {
  it('accepts the documented shape', () => {
    expect(isEsignSettings(OK)).toBe(true)
    expect(isEsignSettings({ ...OK, env: 'production' })).toBe(true)
  })

  it('rejects a bad env, a missing key, or a string id', () => {
    expect(isEsignSettings({ ...OK, env: 'staging' })).toBe(false)
    expect(
      isEsignSettings({ ...OK, mapping: { engagement_letter: 1001 } })
    ).toBe(false)
    expect(
      isEsignSettings({ ...OK, mapping: { ...OK.mapping, form_2848: '7' } })
    ).toBe(false)
    expect(isEsignSettings(null)).toBe(false)
  })
})
