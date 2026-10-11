import { describe, expect, it } from 'vitest'
import {
  detectLookupType,
  isConfirmResponse,
  isLookupResponse,
  logicsErrorCopy,
} from './lookup-api'

// Same cases as worker/src/integrations/logics/lookup.test.ts: the SPA copy must agree with the Worker.
describe('detectLookupType', () => {
  it('classifies an email', () => {
    expect(detectLookupType('a@b.co')).toBe('email')
    expect(detectLookupType('jordan.rivera@example.com')).toBe('email')
  })

  it('classifies 1-9 digits as a case ID', () => {
    expect(detectLookupType('900001')).toBe('case_id')
  })

  it('classifies formatted and bare US phone numbers', () => {
    for (const p of ['(555)010-0001', '555-010-0001', '5550100001', '15550100001'])
      expect(detectLookupType(p)).toBe('phone')
    expect(detectLookupType('(555) 010-0001')).toBe('phone')
  })

  it('returns null for 11 digits without a leading 1, empty input, and words', () => {
    expect(detectLookupType('21211212121')).toBeNull()
    expect(detectLookupType('')).toBeNull()
    expect(detectLookupType('   ')).toBeNull()
    expect(detectLookupType('Jordan')).toBeNull()
  })
})

describe('guards', () => {
  const summary = {
    logics_case_id: 900001,
    first_name: 'Jordan',
    last_name: 'Rivera',
    status_id: 191,
    created_date: '2026-08-14T15:02:11',
    cell_phone: '(555)010-0001',
    home_phone: null,
    work_phone: null,
    email: 'jordan.rivera@example.com',
    city: 'Austin',
    state: 'TX',
    zip: '78701',
    language: null,
    matched_field: 'cell',
  }

  it('isLookupResponse accepts fake and live results', () => {
    expect(isLookupResponse({ results: [], mode: 'fake' })).toBe(true)
    expect(isLookupResponse({ results: [summary], mode: 'live' })).toBe(true)
  })

  it('isLookupResponse rejects an unknown mode or a malformed result', () => {
    expect(isLookupResponse({ results: [], mode: 'other' })).toBe(false)
    expect(
      isLookupResponse({ results: [{ ...summary, logics_case_id: '1' }], mode: 'fake' })
    ).toBe(false)
  })

  it('isConfirmResponse requires a string case_id and a numeric logics_case_id', () => {
    const ok = {
      case_id: 'c1',
      logics_case_id: 900001,
      first_name: 'Jordan',
      last_name: 'Rivera',
      email: 'jordan.rivera@example.com',
      phone_e164: '+15550100001',
    }
    expect(isConfirmResponse(ok)).toBe(true)
    expect(isConfirmResponse({ ...ok, case_id: 1 })).toBe(false)
  })
})

describe('logicsErrorCopy', () => {
  it('has two-part copy for the four Logics failures and nothing else', () => {
    expect(logicsErrorCopy('logics_not_configured')?.title).toBe(
      'Logics is not configured'
    )
    expect(logicsErrorCopy('logics_unreachable')?.title).toBe("Couldn't reach Logics")
    expect(logicsErrorCopy('logics_unauthorized')?.title).toBe(
      'Logics rejected the credentials'
    )
    expect(logicsErrorCopy('logics_forbidden')?.body).toContain('case.read')
    expect(logicsErrorCopy('internal')).toBeUndefined()
  })
})
