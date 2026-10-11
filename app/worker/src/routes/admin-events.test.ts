import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyStaffJwt } from '../auth/staff-jwt'
import { listCaseEvents, type EventRow } from '../db/review'
import { getStaffProfile } from '../db/staff'
import { app } from '../index'

vi.mock('../auth/staff-jwt', () => ({ verifyStaffJwt: vi.fn() }))
vi.mock('../db/staff', () => ({ getStaffProfile: vi.fn() }))
vi.mock('../db/review', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../db/review')>()),
  listCaseEvents: vi.fn(),
}))

const ENV = { SUPABASE_URL: 'https://unit.supabase.test', SUPABASE_SECRET_KEY: 'unit' } as unknown as Env
const C1 = '44444444-4444-4444-8444-444444444444'

const event = (id: number, created_at: string): EventRow => ({
  id,
  actor_type: 'staff',
  actor_id: 'U1',
  action: 'item.approved',
  payload: {},
  created_at,
  request_id: null,
})
const ROWS = [event(3, '2026-10-11T03:00:00Z'), event(2, '2026-10-11T02:00:00Z'), event(1, '2026-10-11T01:00:00Z')]

const get = (query = '') =>
  app.request(`/api/admin/cases/${C1}/events${query}`, { headers: { authorization: 'Bearer unit-token' } }, ENV)

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.mocked(verifyStaffJwt).mockResolvedValue({ sub: 'U1', app_metadata: { firm_id: 'F1' } } as never)
  vi.mocked(getStaffProfile).mockResolvedValue({ user_id: 'U1', firm_id: 'F1', role: 'staff', display_name: 'Z' } as never)
  vi.mocked(listCaseEvents).mockResolvedValue(ROWS)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('GET /cases/:id/events', () => {
  it('returns the events with next_before null when fewer than limit came back', async () => {
    const res = await get()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ events: ROWS, next_before: null })
    expect(listCaseEvents).toHaveBeenCalledWith(ENV, 'F1', C1, null, 50)
  })

  it('sets next_before to the last row when a full page came back', async () => {
    vi.mocked(listCaseEvents).mockResolvedValue(ROWS.slice(0, 2))
    const res = await get('?limit=2')
    expect(((await res.json()) as { next_before: string }).next_before).toBe('2026-10-11T02:00:00Z')
    expect(listCaseEvents).toHaveBeenCalledWith(ENV, 'F1', C1, null, 2)
  })

  it('clamps the limit to 50', async () => {
    await get('?limit=500')
    expect(listCaseEvents).toHaveBeenCalledWith(ENV, 'F1', C1, null, 50)
  })

  it('refuses an unparsable before with 400 bad_request', async () => {
    const res = await get('?before=not-a-date')
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('bad_request')
    expect(listCaseEvents).not.toHaveBeenCalled()
  })

  it('passes a valid before through as ISO', async () => {
    await get('?before=2026-10-10T00:00:00Z')
    expect(listCaseEvents).toHaveBeenCalledWith(ENV, 'F1', C1, '2026-10-10T00:00:00.000Z', 50)
  })

  it('answers 404 for a case of another firm', async () => {
    vi.mocked(listCaseEvents).mockResolvedValue(null)
    expect((await get()).status).toBe(404)
  })
})
