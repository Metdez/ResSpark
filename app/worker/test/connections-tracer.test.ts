import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { insertConnection } from '../src/db/connections'
import { _setDefaultFirmIdForTests } from '../src/db/webhook-events'
import { app } from '../src/index'
import { queue, type Job } from '../src/jobs/index'
import {
  deleteFixtureWebhooks,
  fixtureText,
  seedConnectionFixture,
  TEST_FIRM_ID,
  type ConnectionFixture,
} from './fixtures/connections'
import { signTruv } from './helpers/truv-sign'
import { stubVendorFetch } from './helpers/vendor-fetch'

// WEBH-01 / WEBH-03 / PAY-04 tracer against the live project (test firm 00000000-0000-0000-0000-00000000000e):
// signed Truv order-status-updated -> 200 -> one webhook_events row -> queue() -> stubbed
// GET /v1/orders/ord_fixture_1/ (two completed employers) -> connection done -> item submitted
// -> request waiting_on_staff -> one connection.done event. Only the Truv API is stubbed.
const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env
const live = Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY)
// eslint-disable-next-line no-console -- the skip reason must be visible in the run output
if (!live) console.warn('connections tracer skipped: missing SUPABASE_URL or SUPABASE_SECRET_KEY')

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

describe.skipIf(!live)('connections tracer (live; needs SUPABASE_URL, SUPABASE_SECRET_KEY)', () => {
  // a plain recorder: this config clears vi.fn() call history between tests
  const sent: Job[] = []
  const send = async (job: Job) => {
    sent.push(job)
  }
  const secret = 'test-secret-' + randomUUID()
  const env = { ...process.env, TRUV_CLIENT_ID: 'test-client', TRUV_SECRET: secret, JOBS: { send } } as unknown as Env
  const startedAt = new Date().toISOString()
  let fx: ConnectionFixture
  let connectionId = ''
  let raw = ''
  let vendor: ReturnType<typeof stubVendorFetch> | undefined

  const post = async (body: string, signature: string) =>
    app.request(
      '/api/webhooks/truv',
      { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-webhook-sign': signature } },
      env
    )
  const ledger = async () =>
    (await fx.admin.from('webhook_events').select('*').eq('provider', 'truv').eq('event_key', 'wh_fixture_order_1')).data!

  beforeAll(async () => {
    _setDefaultFirmIdForTests(TEST_FIRM_ID)
    fx = await seedConnectionFixture(env, { kind: 'payroll' })
    // leftovers of a crashed run would turn the first delivery into a duplicate / violate the unique order id
    await deleteFixtureWebhooks(fx.admin)
    await fx.admin.from('connections').delete().eq('provider', 'truv').eq('external_id', 'ord_fixture_1')
    const conn = await insertConnection(env, {
      firm_id: fx.firm_id,
      request_id: fx.request_id,
      request_item_id: fx.item_id,
      case_id: fx.case_id,
      provider: 'truv',
      kind: 'payroll',
      external_id: 'ord_fixture_1',
    })
    expect(conn.status).toBe('pending')
    connectionId = conn.id
    raw = JSON.stringify({ ...JSON.parse(fixtureText('truv/order_status_updated.json')), order_number: fx.request_id })
    const order = fixtureText('truv/order_two_employers.json')
    vendor = stubVendorFetch([
      {
        host: 'prod.truv.com',
        path: '/v1/orders/ord_fixture_1/',
        method: 'GET',
        respond: () => new Response(order, { headers: { 'content-type': 'application/json' } }),
      },
    ])
  })

  afterAll(async () => {
    vendor?.restore()
    _setDefaultFirmIdForTests(null)
    if (!fx) return
    await deleteFixtureWebhooks(fx.admin)
    await fx.cleanup()
  })

  it('verifies the raw bytes, records one ledger row, enqueues an id and answers 200 in under a second', async () => {
    const t0 = Date.now()
    const res = await post(raw, await signTruv(secret, raw))
    const elapsed = Date.now() - t0
    // eslint-disable-next-line no-console -- the measured latency is recorded in the run output
    console.info(`first POST /api/webhooks/truv: ${elapsed} ms`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(elapsed).toBeLessThan(1000)
    expect(sent).toEqual([{ type: 'webhook', provider: 'truv', ref: expect.stringMatching(UUID) }])
    const rows = await ledger()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ provider: 'truv', event_key: 'wh_fixture_order_1', status: 'queued' })
    expect(vendor!.calls).toHaveLength(0) // no vendor call in the handler
  })

  it('answers a redelivery of the same bytes with duplicate: true and enqueues nothing', async () => {
    const res = await post(raw, await signTruv(secret, raw))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, duplicate: true })
    expect(sent).toHaveLength(1)
    expect(await ledger()).toHaveLength(1)
  })

  it('consumer re-reads the order and moves connection, item and request forward', async () => {
    const job = sent[0]
    const ack = vi.fn()
    const retry = vi.fn()
    await queue({ queue: 'resspark-jobs', messages: [{ body: job, attempts: 1, ack, retry }] } as unknown as MessageBatch<Job>, env)
    expect(ack).toHaveBeenCalledTimes(1)
    expect(retry).not.toHaveBeenCalled()

    expect(vendor!.calls).toHaveLength(1)
    const call = vendor!.calls[0]
    expect(call.method).toBe('GET')
    expect(call.url).toBe('https://prod.truv.com/v1/orders/ord_fixture_1/')
    expect(call.headers.get('X-Access-Client-Id')).toBe('test-client')
    expect(call.headers.get('X-Access-Secret')).toBe(secret)

    const conn = (await fx.admin.from('connections').select('*').eq('id', connectionId).single()).data!
    expect(conn.status).toBe('done')
    expect(conn.completed_at).toBeTruthy()
    expect(conn.last_webhook_at).toBeTruthy()
    const employers = (conn.data as { employers: { company_name: string; status: string }[] }).employers
    expect(employers.map((e) => e.company_name)).toEqual(['Acme Inc', 'Beta LLC'])
    expect(employers.every((e) => e.status === 'done')).toBe(true)

    const item = (await fx.admin.from('request_items').select('status').eq('id', fx.item_id).single()).data!
    expect(item.status).toBe('submitted')
    const request = (await fx.admin.from('requests').select('status').eq('id', fx.request_id).single()).data!
    expect(request.status).toBe('waiting_on_staff')

    const events = (await fx.admin.from('events').select('payload').eq('request_id', fx.request_id).eq('action', 'connection.done'))
      .data!
    expect(events).toHaveLength(1)
    const payload = events[0].payload as Record<string, unknown>
    expect(payload.connection_id).toBe(connectionId)
    for (const k of ['access_token', 'bridge_token', 'webhook_sign']) expect(payload).not.toHaveProperty(k)

    const [row] = await ledger()
    expect(row.status).toBe('done')
    expect(row.processed_at).toBeTruthy()
  })

  it('rejects a body signed with the wrong secret: 401, no ledger row, one webhook.rejected event with { provider } only', async () => {
    const other = JSON.stringify({ ...JSON.parse(raw), webhook_id: 'wh_fixture_rejected_1' })
    const res = await post(other, await signTruv('wrong-secret', other))
    expect(res.status).toBe(401)
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('invalid_signature')
    const rows = (await fx.admin.from('webhook_events').select('id').eq('event_key', 'wh_fixture_rejected_1')).data!
    expect(rows).toHaveLength(0)
    const events = (
      await fx.admin
        .from('events')
        .select('payload, actor_id')
        .eq('firm_id', TEST_FIRM_ID)
        .eq('action', 'webhook.rejected')
        .gte('created_at', startedAt)
    ).data!
    expect(events).toHaveLength(1)
    expect(events[0].payload).toEqual({ provider: 'truv' })
    expect(sent).toHaveLength(1)
  })
})
