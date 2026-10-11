import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAdminClient } from './client'

const MISSING = 'Missing SUPABASE_URL or SUPABASE_SECRET_KEY'

describe('createAdminClient', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('throws when SUPABASE_URL is empty', () => {
    expect(() => createAdminClient({ SUPABASE_URL: '', SUPABASE_SECRET_KEY: 'x' })).toThrow(MISSING)
  })

  it('throws when SUPABASE_SECRET_KEY is empty', () => {
    expect(() =>
      createAdminClient({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: '' })
    ).toThrow(MISSING)
  })

  it('throws when both are undefined', () => {
    const env = {} as { SUPABASE_URL: string; SUPABASE_SECRET_KEY: string }
    expect(() => createAdminClient(env)).toThrow(MISSING)
  })

  it('returns a client without making a network call', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const admin = createAdminClient({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SECRET_KEY: 'sb_secret_test',
    })
    expect(typeof admin.from).toBe('function')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
