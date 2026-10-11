import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { insertConnection } from '../src/db/connections'
import { seedConnectionFixture, type ConnectionFixture } from './fixtures/connections'

// WEBH-03 rank matrix for connection_set_status, driven straight through the RPC against the live
// project (test firm 00000000-0000-0000-0000-00000000000e). Rank: pending 10 < connected 30 <
// syncing 40 < error 45 < done 50 < removed 60; error is repairable by connected/syncing/done.
const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env
const live = Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY)
// eslint-disable-next-line no-console -- the skip reason must be visible in the run output
if (!live) console.warn('connection status matrix skipped: missing SUPABASE_URL or SUPABASE_SECRET_KEY')

interface Applied {
  applied: boolean
  status: string
  item_status: string | null
  request_status: string | null
}

describe.skipIf(!live)('connection_set_status rank matrix (live; needs SUPABASE_URL, SUPABASE_SECRET_KEY)', () => {
  const env = { SUPABASE_URL, SUPABASE_SECRET_KEY } as unknown as Env
  let fx: ConnectionFixture
  let approvedFx: ConnectionFixture
  let db: SupabaseClient
  let main = ''
  let errored = ''

  const newConnection = async (f: ConnectionFixture = fx) =>
    (
      await insertConnection(env, {
        firm_id: f.firm_id,
        request_id: f.request_id,
        request_item_id: f.item_id,
        case_id: f.case_id,
        provider: 'truv',
        kind: 'payroll',
      })
    ).id
  const set = async (id: string, status: string, detail: Record<string, unknown> = {}) => {
    const { data, error } = await db.rpc('connection_set_status', { p_connection_id: id, p_new_status: status, p_detail: detail })
    if (error) throw new Error(error.message)
    return data as Applied
  }
  const row = async (id: string) => (await db.from('connections').select('*').eq('id', id).single()).data!
  const events = async (id: string, action?: string) => {
    let q = db.from('events').select('action, payload').eq('payload->>connection_id', id)
    if (action) q = q.eq('action', action)
    return (await q).data!
  }

  beforeAll(async () => {
    fx = await seedConnectionFixture(env, { kind: 'payroll' })
    approvedFx = await seedConnectionFixture(env, { kind: 'payroll' })
    db = fx.admin
    main = await newConnection()
  })

  afterAll(async () => {
    await fx?.cleanup()
    await approvedFx?.cleanup()
  })

  it('pending -> connected applies, submits the item, stamps connected_at and logs connection.connected', async () => {
    const res = await set(main, 'connected')
    expect(res).toMatchObject({ applied: true, status: 'connected', item_status: 'submitted' })
    expect((await row(main)).connected_at).toBeTruthy()
    const item = (await db.from('request_items').select('status').eq('id', fx.item_id).single()).data!
    expect(item.status).toBe('submitted')
    expect(await events(main, 'connection.connected')).toHaveLength(1)
  })

  it('connected -> syncing applies', async () => {
    expect(await set(main, 'syncing')).toMatchObject({ applied: true, status: 'syncing' })
  })

  it('syncing -> done applies, stamps completed_at and the request waits on staff', async () => {
    const res = await set(main, 'done')
    expect(res).toMatchObject({ applied: true, status: 'done', request_status: 'waiting_on_staff' })
    expect((await row(main)).completed_at).toBeTruthy()
    const request = (await db.from('requests').select('status').eq('id', fx.request_id).single()).data!
    expect(request.status).toBe('waiting_on_staff')
  })

  it('done -> pending is not applied, the row stays done and no event is written', async () => {
    const before = (await events(main)).length
    expect(await set(main, 'pending')).toMatchObject({ applied: false, status: 'done' })
    expect((await row(main)).status).toBe('done')
    expect(await events(main)).toHaveLength(before)
  })

  it('done -> connected is not applied', async () => {
    expect(await set(main, 'connected')).toMatchObject({ applied: false, status: 'done' })
  })

  it('done -> done is an idempotent no-op: applied, no second event', async () => {
    const before = (await events(main)).length
    expect(await set(main, 'done')).toMatchObject({ applied: true, status: 'done' })
    expect(await events(main)).toHaveLength(before)
    expect(await events(main, 'connection.done')).toHaveLength(1)
  })

  it('done -> error is not applied: a stale error never undoes completion', async () => {
    expect(await set(main, 'error', { code: 'late' })).toMatchObject({ applied: false, status: 'done' })
    expect((await row(main)).error).toBeNull()
  })

  it('pending -> error applies and stores the detail', async () => {
    errored = await newConnection()
    expect(await set(errored, 'error', { code: 'x' })).toMatchObject({ applied: true, status: 'error' })
    expect((await row(errored)).error).toEqual({ code: 'x' })
  })

  it('error -> pending is not applied (a stale pending does not clear an error)', async () => {
    expect(await set(errored, 'pending')).toMatchObject({ applied: false, status: 'error' })
  })

  it('error -> error applies with the new reason and logs a second connection.error', async () => {
    expect(await set(errored, 'error', { code: 'y' })).toMatchObject({ applied: true, status: 'error' })
    expect(((await row(errored)).error as { code: string }).code).toBe('y')
    expect(await events(errored, 'connection.error')).toHaveLength(2)
  })

  it('error -> connected applies (repairable) and clears the error', async () => {
    expect(await set(errored, 'connected')).toMatchObject({ applied: true, status: 'connected' })
    expect((await row(errored)).error).toBeNull()
  })

  it('connected -> removed applies and removed is terminal', async () => {
    expect(await set(errored, 'removed')).toMatchObject({ applied: true, status: 'removed' })
    expect((await row(errored)).removed_at).toBeTruthy()
    expect(await set(errored, 'done')).toMatchObject({ applied: false, status: 'removed' })
  })

  it('an unknown status raises bad_status', async () => {
    await expect(set(main, 'finished')).rejects.toThrow(/bad_status/)
  })

  it('an unknown connection raises connection_not_found', async () => {
    await expect(set(randomUUID(), 'done')).rejects.toThrow(/connection_not_found/)
  })

  it('never moves an item staff already approved', async () => {
    await db.from('request_items').update({ status: 'approved' }).eq('id', approvedFx.item_id)
    const id = await newConnection(approvedFx)
    expect(await set(id, 'connected')).toMatchObject({ applied: true, status: 'connected', item_status: 'approved' })
    const item = (await db.from('request_items').select('status').eq('id', approvedFx.item_id).single()).data!
    expect(item.status).toBe('approved')
  })

  it('serializes concurrent writers on the row lock: Promise.all(connected, syncing) ends syncing', async () => {
    const id = await newConnection()
    const results = await Promise.all([set(id, 'connected'), set(id, 'syncing')])
    expect(results.every((r) => r.status === 'connected' || r.status === 'syncing')).toBe(true)
    expect((await row(id)).status).toBe('syncing')
  })

  it('connection_record_event writes one firm-scoped event carrying connection_id and the payload', async () => {
    const { error } = await db.rpc('connection_record_event', { p_connection_id: main, p_action: 'test.event', p_payload: { a: 1 } })
    expect(error).toBeNull()
    const rows = await events(main, 'test.event')
    expect(rows).toHaveLength(1)
    expect(rows[0].payload).toEqual({ a: 1, connection_id: main })
  })
})
