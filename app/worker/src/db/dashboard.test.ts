import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAdminClient } from './client'
import { clientName, listCaseRequests, sanitizeQuery } from './dashboard'

vi.mock('./client', () => ({ createAdminClient: vi.fn() }))

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

// A PostgREST builder stand-in: every call returns the same chain, and awaiting it yields `res`.
function queryReturning(res: { data: unknown; error: unknown }) {
  const calls: [string, unknown[]][] = []
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(res).then(resolve),
  }
  for (const m of ['from', 'select', 'eq', 'neq', 'order', 'limit']) {
    chain[m] = (...args: unknown[]) => {
      calls.push([m, args])
      return chain
    }
  }
  vi.mocked(createAdminClient).mockReturnValue(chain as unknown as ReturnType<typeof createAdminClient>)
  return calls
}
const env = { SUPABASE_URL: 'https://x.supabase.test', SUPABASE_SECRET_KEY: 'unit' }

describe('listCaseRequests', () => {
  afterEach(() => vi.clearAllMocks())

  it('reads the case rows from the dashboard view, newest first, without revoked ones', async () => {
    const rows = [
      { id: 'R2', status: 'sent', agent_display_name: 'Zack', sent_at: '2026-10-12T10:00:00Z', created_at: '2026-10-12T09:00:00Z' },
      { id: 'R1', status: 'draft', agent_display_name: null, sent_at: null, created_at: '2026-10-11T09:00:00Z' },
    ]
    const calls = queryReturning({ data: rows, error: null })
    await expect(listCaseRequests(env, 'F1', 'K1')).resolves.toEqual(rows)
    expect(createAdminClient).toHaveBeenCalledWith(env)
    expect(calls).toEqual([
      ['from', ['request_dashboard_v']],
      ['select', ['id, status, agent_display_name, sent_at, created_at']],
      ['eq', ['firm_id', 'F1']],
      ['eq', ['case_id', 'K1']],
      ['neq', ['status', 'revoked']],
      ['order', ['created_at', { ascending: false }]],
      ['limit', [20]],
    ])
  })

  it('hides the database message behind requests_lookup_failed', async () => {
    queryReturning({ data: null, error: { message: 'boom' } })
    await expect(listCaseRequests(env, 'F1', 'K1')).rejects.toThrow('requests_lookup_failed')
  })
})
