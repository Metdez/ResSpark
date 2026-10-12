import { describe, expect, it } from 'vitest'
import { logicsWriteGuard } from './write-guard'

const env = (flag: string, ids: string) => ({
  LOGICS_WRITE_ENABLED: flag,
  LOGICS_TEST_CASE_IDS: ids,
})

describe('logicsWriteGuard', () => {
  it('returns when the flag is exactly true and the trimmed id is listed', () => {
    expect(logicsWriteGuard(env('true', ' 12345 , 67890'), '12345')).toBeUndefined()
  })

  it('throws when the flag is false even for a listed id', () => {
    expect(() => logicsWriteGuard(env('false', '12345'), '12345')).toThrow(
      'logics_write_blocked'
    )
  })

  it('returns for any id when the allowlist is the wildcard *', () => {
    expect(logicsWriteGuard(env('true', ' * '), '99999')).toBeUndefined()
  })

  it('throws for the wildcard * when the flag is false', () => {
    expect(() => logicsWriteGuard(env('false', '*'), '99999')).toThrow('logics_write_blocked')
  })

  it('throws when the allowlist is empty', () => {
    expect(() => logicsWriteGuard(env('true', ''), '12345')).toThrow(
      'logics_write_blocked'
    )
  })

  it('throws for a prefix of a listed id', () => {
    expect(() => logicsWriteGuard(env('true', '12345'), '1234')).toThrow(
      'logics_write_blocked'
    )
  })

  it('throws when the flag is TRUE (exact lowercase true only)', () => {
    expect(() => logicsWriteGuard(env('TRUE', '12345'), '12345')).toThrow(
      'logics_write_blocked'
    )
  })

  it('never puts the id or env values in the error message', () => {
    let message = ''
    try {
      logicsWriteGuard(env('false', '12345,67890'), '12345')
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toBe('logics_write_blocked')
  })
})
