import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createAdminClient } from '../src/db/client'
import { getStaffProfile } from '../src/db/staff'
import { app } from '../src/index'

// Live PLAT-04/PLAT-07 proof: a real Supabase access token through the Worker's staffAuth
// into the events table. Run with `pnpm -C app run test:live`. Rows stay (append-only).
const { SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY } = process.env
const { DEMO_STAFF_EMAIL, DEMO_STAFF_PASSWORD } = process.env
const FIRM = '00000000-0000-0000-0000-000000000001'
const ready =
  SUPABASE_URL &&
  SUPABASE_SECRET_KEY &&
  SUPABASE_PUBLISHABLE_KEY &&
  DEMO_STAFF_EMAIL &&
  DEMO_STAFF_PASSWORD

describe.skipIf(!ready)('/api/admin/session (live)', () => {
  const env = { SUPABASE_URL: SUPABASE_URL!, SUPABASE_SECRET_KEY: SUPABASE_SECRET_KEY! }
  const anon = createClient(SUPABASE_URL ?? 'http://unset', SUPABASE_PUBLISHABLE_KEY ?? 'unset', {
    auth: { persistSession: false },
  })
  let accessToken = ''
  let userId = ''

  const send = (init: RequestInit) =>
    app.request('/api/admin/session', init, env as unknown as Env)
  const postEvent = (event: string) =>
    send({
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ event }),
    })
  const readEvent = async (id: number) => {
    const { data, error } = await createAdminClient(env)
      .from('events')
      .select('action, actor_type, actor_id, firm_id, created_at')
      .eq('id', id)
      .single()
    if (error) throw new Error('event read failed')
    return data
  }

  beforeAll(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const { data, error } = await anon.auth.signInWithPassword({
      email: DEMO_STAFF_EMAIL!,
      password: DEMO_STAFF_PASSWORD!,
    })
    if (error || !data.session) throw new Error('demo staff sign-in failed')
    accessToken = data.session.access_token
    userId = data.user.id
  })

  afterAll(async () => {
    await anon.auth.signOut()
    vi.restoreAllMocks()
  })

  it('POST signed_in writes one staff.signed_in row for the verified user', async () => {
    const res = await postEvent('signed_in')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; event_id: number }
    expect(body.ok).toBe(true)
    expect(typeof body.event_id).toBe('number')
    const row = await readEvent(body.event_id)
    expect(row.action).toBe('staff.signed_in')
    expect(row.actor_type).toBe('staff')
    expect(row.actor_id).toBe(userId)
    expect(row.firm_id).toBe(FIRM)
    expect(Number.isNaN(Date.parse(row.created_at))).toBe(false)
  })

  it('three concurrent posts yield three distinct event ids', async () => {
    const responses = await Promise.all([1, 2, 3].map(() => postEvent('signed_in')))
    const ids = await Promise.all(
      responses.map(async (r) => {
        expect(r.status).toBe(200)
        return ((await r.json()) as { event_id: number }).event_id
      })
    )
    expect(new Set(ids).size).toBe(3)
  })

  it('GET returns the seeded staff profile', async () => {
    const res = await send({ headers: { authorization: `Bearer ${accessToken}` } })
    expect(res.status).toBe(200)
    const profile = await getStaffProfile(env, userId)
    expect(await res.json()).toMatchObject({
      user_id: userId,
      firm_id: FIRM,
      role: profile!.role,
      display_name: profile!.display_name,
    })
  })

  it('POST signed_out writes a staff.signed_out row', async () => {
    const res = await postEvent('signed_out')
    expect(res.status).toBe(200)
    const { event_id } = (await res.json()) as { event_id: number }
    const row = await readEvent(event_id)
    expect(row.action).toBe('staff.signed_out')
    expect(row.actor_id).toBe(userId)
  })

  it('POST without a token is 401 against the live JWKS', async () => {
    const res = await send({ method: 'POST', body: JSON.stringify({ event: 'signed_in' }) })
    expect(res.status).toBe(401)
  })
})
