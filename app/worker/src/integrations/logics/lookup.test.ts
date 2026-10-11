import { describe, expect, it, vi } from 'vitest'
import type { LogicsClient, LogicsFindRow } from './client'
import { createFakeLogicsClient } from './fixtures'
import { detectLookupType, fetchCaseSummary, lookupCases } from './lookup'

const fake = createFakeLogicsClient()

const stubClient = (findByPhone: LogicsClient['findByPhone']): LogicsClient => ({
  findByPhone: vi.fn(findByPhone),
  findByEmail: vi.fn(async () => []),
  findByLastNameAndPhone: vi.fn(async () => []),
  caseInfo: vi.fn(async () => null),
})

const docRow: LogicsFindRow = { CaseID: 344624, CreatedDate: '2023-04-21T06:52:18', HomePhone: '(121)121-2121' }

describe('detectLookupType', () => {
  it('classifies email, case id, and phone shapes', () => {
    expect(detectLookupType('jordan.rivera@example.com')).toBe('email')
    expect(detectLookupType('900001')).toBe('case_id')
    for (const p of ['(555)010-0001', '555-010-0001', '5550100001', '15550100001']) {
      expect(detectLookupType(p)).toBe('phone')
    }
  })

  it('returns null for 11 digits without a leading 1, empty, and words', () => {
    expect(detectLookupType('12345678901')).toBeNull()
    expect(detectLookupType('')).toBeNull()
    expect(detectLookupType('   ')).toBeNull()
    expect(detectLookupType('Rivera')).toBeNull()
  })
})

describe('lookupCases (fake client)', () => {
  it('a shared phone returns two cards ordered by created date desc, each naming the matched field', async () => {
    const r = await lookupCases(fake, { type: 'phone', value: '(555) 010-0001' })
    expect(r.map((s) => [s.logics_case_id, s.matched_field])).toEqual([
      [900002, 'home'],
      [900001, 'cell'],
    ])
  })

  it('a last name narrows through findByLastNameAndPhone', async () => {
    const spy = vi.spyOn(fake, 'findByLastNameAndPhone')
    const r = await lookupCases(fake, { type: 'phone', value: '5550100001', last_name: 'Rivera' })
    expect(spy).toHaveBeenCalledWith('Rivera', '5550100001')
    expect(r.map((s) => s.logics_case_id)).toEqual([900002, 900001])
    expect(r.every((s) => s.matched_field === 'last_name_phone')).toBe(true)
    spy.mockRestore()
  })

  it('email is trimmed and lowercased', async () => {
    const r = await lookupCases(fake, { type: 'email', value: '  Morgan.Lee@EXAMPLE.com ' })
    expect(r.map((s) => [s.logics_case_id, s.matched_field])).toEqual([[900003, 'email']])
  })

  it('a case id returns one summary matched on case_id', async () => {
    const r = await lookupCases(fake, { type: 'case_id', value: '900004' })
    expect(r.map((s) => [s.logics_case_id, s.matched_field])).toEqual([[900004, 'case_id']])
  })

  it('an unknown case id returns []', async () => {
    await expect(lookupCases(fake, { type: 'case_id', value: '123' })).resolves.toEqual([])
  })

  it('rejects invalid input with the exact tokens', async () => {
    await expect(lookupCases(fake, { type: 'phone', value: '555010' })).rejects.toThrow('phone_invalid')
    await expect(lookupCases(fake, { type: 'email', value: 'nope' })).rejects.toThrow('email_invalid')
    await expect(lookupCases(fake, { type: 'case_id', value: '1234567890' })).rejects.toThrow('case_id_invalid')
    await expect(lookupCases(fake, { type: 'case_id', value: '12a' })).rejects.toThrow('case_id_invalid')
  })
})

describe('lookupCases (stubbed live client)', () => {
  it('retries in (###)###-#### format only when the digits-only call is empty, and uses the retry result', async () => {
    const client = stubClient(async (p) => (p === '(121)121-2121' ? [docRow] : []))
    const r = await lookupCases(client, { type: 'phone', value: '121-121-2121' })
    expect(r.map((s) => [s.logics_case_id, s.matched_field])).toEqual([[344624, 'home']])
    expect(vi.mocked(client.findByPhone).mock.calls).toEqual([['1211212121'], ['(121)121-2121']])
  })

  it('does not retry when the first call returns a row', async () => {
    const client = stubClient(async () => [docRow])
    await lookupCases(client, { type: 'phone', value: '+1 121 121 2121' })
    expect(client.findByPhone).toHaveBeenCalledTimes(1)
  })

  it('collapses duplicate CaseIDs to the first occurrence', async () => {
    const client = stubClient(async () => [docRow, { ...docRow, FirstName: 'dup' }, { CaseID: 7 }])
    const r = await lookupCases(client, { type: 'phone', value: '1211212121' })
    expect(r.map((s) => [s.logics_case_id, s.first_name])).toEqual([
      [344624, null],
      [7, null],
    ])
  })

  it('breaks created-date ties by case id ascending and sorts null dates last', async () => {
    const d = '2026-01-01T00:00:00'
    const client = stubClient(async () => [{ CaseID: 9 }, { CaseID: 5, CreatedDate: d }, { CaseID: 3, CreatedDate: d }])
    const r = await lookupCases(client, { type: 'phone', value: '1211212121' })
    expect(r.map((s) => s.logics_case_id)).toEqual([3, 5, 9])
  })
})

describe('fetchCaseSummary', () => {
  it('returns a case_id summary or null', async () => {
    await expect(fetchCaseSummary(fake, 900001)).resolves.toMatchObject({
      logics_case_id: 900001,
      matched_field: 'case_id',
    })
    await expect(fetchCaseSummary(fake, 1)).resolves.toBeNull()
  })
})
