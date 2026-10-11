import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCaseForFinancials } from '../financials/db'
import { decideValue, FinancialRpcError, type FinancialRpcCode } from '../financials/rpc'
import { app } from '../index'

vi.mock('../middleware/staff-auth', async () => {
  const { createMiddleware } = await import('hono/factory')
  return {
    staffAuth: createMiddleware(async (c, next) => {
      c.set('staff', { userId: 'U1', firmId: 'F1', role: 'staff', displayName: 'Z' })
      await next()
    }),
  }
})
vi.mock('../financials/db', () => ({
  getCaseForFinancials: vi.fn(),
  listProposals: vi.fn(),
  getStandardsVersion: vi.fn(),
  staffDisplayNames: vi.fn(),
  getLatestRun: vi.fn(),
  insertDeterminationRun: vi.fn(),
}))
vi.mock('../financials/rpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../financials/rpc')>()),
  decideValue: vi.fn(),
  fetchStandardsBundle: vi.fn(),
}))

const ENV = { SUPABASE_URL: 'https://unit.supabase.test', SUPABASE_SECRET_KEY: 'unit' } as unknown as Env
const C1 = '44444444-4444-4444-8444-444444444444'

const decide = (column: string, body: unknown, id = C1) =>
  app.request(
    `/api/admin/cases/${id}/financials/${column}/decide`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
    ENV
  )
const errorOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.mocked(decideValue).mockResolvedValue({ column: 'household_size', action: 'accept', proposal_id: 'P1' })
  vi.mocked(getCaseForFinancials).mockResolvedValue(null)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('POST /cases/:id/financials/:column/decide', () => {
  it('passes the session firm and actor to the RPC', async () => {
    const res = await decide('household_size', { action: 'known_zero', note: 'n' })
    expect(res.status).toBe(200)
    expect(decideValue).toHaveBeenCalledWith(ENV, {
      firmId: 'F1',
      caseId: C1,
      column: 'household_size',
      action: 'known_zero',
      value: undefined,
      proposalId: null,
      note: 'n',
      actorId: 'U1',
    })
  })

  it('an unknown column is 400 bad_column without calling the RPC', async () => {
    const res = await decide('updated_at', { action: 'edit', value: 1, note: 'x' })
    expect(res.status).toBe(400)
    expect(await errorOf(res)).toBe('bad_column')
    expect(decideValue).not.toHaveBeenCalled()
  })

  it.each([
    [{ action: 'nope' }],
    [{}],
    [{ action: 'accept', proposal_id: 'not-a-uuid' }],
    [{ action: 'edit', value: 1, note: 5 }],
  ])('body %j is 400 bad_request', async (body) => {
    const res = await decide('household_size', body)
    expect(res.status).toBe(400)
    expect(await errorOf(res)).toBe('bad_request')
    expect(decideValue).not.toHaveBeenCalled()
  })

  it.each<[FinancialRpcCode, number, string]>([
    ['note_required', 400, 'note_required'],
    ['bad_value', 400, 'bad_value'],
    ['bad_action', 400, 'bad_action'],
    ['proposal_stale', 409, 'proposal_stale'],
    ['case_not_found', 404, 'not_found'],
  ])('RPC %s maps to %i %s', async (token, status, code) => {
    vi.mocked(decideValue).mockRejectedValue(new FinancialRpcError(token))
    const res = await decide('household_size', { action: 'edit', value: 1 })
    expect(res.status).toBe(status)
    expect(await errorOf(res)).toBe(code)
  })

  it('any other error is 500 internal', async () => {
    vi.mocked(decideValue).mockRejectedValue(new Error('financials_rpc_failed'))
    const res = await decide('household_size', { action: 'edit', value: 1 })
    expect(res.status).toBe(500)
    expect(await errorOf(res)).toBe('internal')
  })

  it('a non-UUID case id is 404', async () => {
    const res = await decide('household_size', { action: 'unknown' }, 'abc')
    expect(res.status).toBe(404)
    expect(decideValue).not.toHaveBeenCalled()
  })
})

describe('foreign or missing cases', () => {
  it.each([
    ['GET', 'financials'],
    ['POST', 'evaluations'],
    ['GET', 'evaluations/latest'],
  ])('%s %s is 404 not_found when the firm-scoped read finds no case', async (method, path) => {
    const res = await app.request(`/api/admin/cases/${C1}/${path}`, { method }, ENV)
    expect(res.status).toBe(404)
    expect(await errorOf(res)).toBe('not_found')
    expect(getCaseForFinancials).toHaveBeenCalledWith(ENV, 'F1', C1)
  })

  it('a non-UUID id is 404 before any read', async () => {
    const res = await app.request('/api/admin/cases/123/financials', {}, ENV)
    expect(res.status).toBe(404)
    expect(getCaseForFinancials).not.toHaveBeenCalled()
  })
})
