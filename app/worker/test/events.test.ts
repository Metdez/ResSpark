import { createClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import { createAdminClient } from '../src/db/client'
import { type ActorType, type EventInput, logEvent } from '../src/db/events'
import { getStaffProfile } from '../src/db/staff'

// PLAT-04 write path against the live project. Run with `pnpm -C app run test:live`.
// Rows written here stay (events is append-only); they are filterable by
// actor_type 'system' + action 'test.ping'.
const { SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY } = process.env
const { DEMO_STAFF_EMAIL, DEMO_STAFF_PASSWORD } = process.env
const FIRM = '00000000-0000-0000-0000-000000000001'
const ready =
  SUPABASE_URL &&
  SUPABASE_SECRET_KEY &&
  SUPABASE_PUBLISHABLE_KEY &&
  DEMO_STAFF_EMAIL &&
  DEMO_STAFF_PASSWORD

describe.skipIf(!ready)('events and staff profiles (live)', () => {
  const env = { SUPABASE_URL: SUPABASE_URL!, SUPABASE_SECRET_KEY: SUPABASE_SECRET_KEY! }
  const ping: EventInput = {
    firm_id: FIRM,
    actor_type: 'system',
    action: 'test.ping',
    payload: { test: true },
  }
  let a = 0
  let b = 0
  let demoUserId = ''

  beforeAll(async () => {
    const anon = createClient(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false },
    })
    const { data, error } = await anon.auth.signInWithPassword({
      email: DEMO_STAFF_EMAIL!,
      password: DEMO_STAFF_PASSWORD!,
    })
    if (error || !data.user) throw new Error('demo staff sign-in failed')
    demoUserId = data.user.id
    await anon.auth.signOut()
  })

  it('writes two distinct rows with increasing ids for identical inputs', async () => {
    a = await logEvent(env, ping)
    b = await logEvent(env, ping)
    expect(typeof a).toBe('number')
    expect(typeof b).toBe('number')
    expect(b).toBeGreaterThan(a)
  })

  it('stores both rows, newest first by id, with payload and created_at', async () => {
    const { data, error } = await createAdminClient(env)
      .from('events')
      .select('id, action, payload, created_at')
      .in('id', [a, b])
      .order('id', { ascending: false })
    expect(error).toBeNull()
    expect(data).toHaveLength(2)
    expect(Number(data![0].id)).toBe(b)
    expect(data![0].action).toBe('test.ping')
    expect(data![0].payload.test).toBe(true)
    expect(Number.isNaN(Date.parse(data![0].created_at))).toBe(false)
  })

  it('stores {} when payload is omitted', async () => {
    const id = await logEvent(env, { firm_id: FIRM, actor_type: 'system', action: 'test.ping' })
    const { data, error } = await createAdminClient(env)
      .from('events')
      .select('payload')
      .eq('id', id)
      .single()
    expect(error).toBeNull()
    expect(data!.payload).toEqual({})
  })

  it('rejects UPDATE with events is append-only', async () => {
    const { error } = await createAdminClient(env)
      .from('events')
      .update({ action: 'x' })
      .eq('id', a)
    expect(error?.message).toContain('events is append-only')
  })

  it('rejects DELETE with events is append-only', async () => {
    const { error } = await createAdminClient(env).from('events').delete().eq('id', a)
    expect(error?.message).toContain('events is append-only')
  })

  it('fails with log_event_failed and no SQL text for an invalid actor_type', async () => {
    const bad = { ...ping, actor_type: 'robot' as ActorType }
    const err = await logEvent(env, bad).then(
      () => null,
      (e: unknown) => e as Error
    )
    expect(err?.message).toBe('log_event_failed')
  })

  it('returns the staff profile for the demo user', async () => {
    const profile = await getStaffProfile(env, demoUserId)
    expect(profile?.user_id).toBe(demoUserId)
    expect(profile?.firm_id).toBe(FIRM)
    expect(['admin', 'staff']).toContain(profile?.role)
    expect(profile?.display_name.length).toBeGreaterThan(0)
  })

  it('returns null for an unknown user id', async () => {
    expect(await getStaffProfile(env, '00000000-0000-0000-0000-000000000000')).toBeNull()
  })
})
