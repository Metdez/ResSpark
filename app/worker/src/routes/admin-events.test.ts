import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyStaffJwt } from '../auth/staff-jwt'
import { beforeFilter, listCaseEvents, type EventRow } from '../db/review'
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
    expect(((await res.json()) as { next_before: string }).next_before).toBe('2026-10-11T02:00:00Z|2')
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

  it('round-trips the cursor with microseconds and the id, untouched', async () => {
    const edge = event(7, '2026-10-11T15:02:58.123456+00:00')
    vi.mocked(listCaseEvents).mockResolvedValue([event(8, '2026-10-11T15:03:00.000001+00:00'), edge])
    const { next_before } = (await (await get('?limit=2')).json()) as { next_before: string }
    expect(next_before).toBe('2026-10-11T15:02:58.123456+00:00|7')
    await get(`?before=${encodeURIComponent(next_before)}`)
    expect(listCaseEvents).toHaveBeenLastCalledWith(ENV, 'F1', C1, { ts: '2026-10-11T15:02:58.123456+00:00', id: 7 }, 50)
  })

  it('asks for rows sharing the edge timestamp with a lower id (tie at the page edge)', () => {
    expect(beforeFilter({ ts: '2026-10-11T15:02:58.123456+00:00', id: 7 })).toBe(
      'created_at.lt."2026-10-11T15:02:58.123456+00:00",and(created_at.eq."2026-10-11T15:02:58.123456+00:00",id.lt.7)'
    )
  })

  it.each(['2026-10-10T00:00:00Z', '2026-10-10T00:00:00Z|x', '2026-10-10T00:00:00Z|1|2', 'x|1', '2026-10-10T00:00:00Z",id.gt.0|1'])(
    'refuses the malformed cursor %s with 400',
    async (before) => {
      const res = await get(`?before=${encodeURIComponent(before)}`)
      expect(res.status).toBe(400)
      expect(listCaseEvents).not.toHaveBeenCalled()
    }
  )

  it('answers 404 for a case of another firm', async () => {
    vi.mocked(listCaseEvents).mockResolvedValue(null)
    expect((await get()).status).toBe(404)
  })
})
