import { describe, expect, it } from 'vitest'
import { isActivityCreated, isCaseDocumentCreated, LOGICS_MAX_PART_BYTES } from './write-types'

describe('write-types', () => {
  it('the part gate is 5.5 MiB, below both readings of 6 MB', () => {
    expect(LOGICS_MAX_PART_BYTES).toBe(5767168)
    expect(LOGICS_MAX_PART_BYTES).toBeLessThan(6_000_000)
  })

  it('isCaseDocumentCreated accepts the vendor example and nothing looser', () => {
    expect(isCaseDocumentCreated({ Success: true, data: { CaseDocumentID: 128346 }, message: 'x', StatusCode: 200 })).toBe(true)
    expect(isCaseDocumentCreated({ Success: true, data: { CaseDocumentID: '128346' } })).toBe(false)
    expect(isCaseDocumentCreated({ Success: true, data: { CaseDocumentID: 1.5 } })).toBe(false)
    expect(isCaseDocumentCreated({ Success: false, data: { CaseDocumentID: 128346 } })).toBe(false)
    expect(isCaseDocumentCreated(null)).toBe(false)
  })

  it('isActivityCreated accepts the vendor example and nothing looser', () => {
    expect(isActivityCreated({ Success: true, data: { ActivityID: 9164821 } })).toBe(true)
    expect(isActivityCreated({ Success: true, data: { ActivityID: '9164821' } })).toBe(false)
    expect(isActivityCreated({ Success: false, data: { ActivityID: 9164821 } })).toBe(false)
    expect(isActivityCreated(null)).toBe(false)
  })
})
