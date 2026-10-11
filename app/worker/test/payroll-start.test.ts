import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CONSENT_TEXT } from '../../src/lib/consent-text'
import { hmacKey, mintLinkToken, uuidToBytes } from '../src/auth/client-link'
import { app } from '../src/index'
import type { Job } from '../src/jobs/index'
import { fixtureText, seedConnectionFixture, type ConnectionFixture } from './fixtures/connections'
import { stubVendorFetch } from './helpers/vendor-fetch'

// PAY-01 / BANK-05 / D-16 tracer against the live project (test firm 00000000-0000-0000-0000-00000000000e):
// cookie -> consent -> payroll start -> stubbed POST /v1/orders/ -> connection row + bridge token.
// Only the Truv API and the static-asset binding are stubbed.
const { SUPABASE_URL, SUPABASE_SECRET_KEY, CLIENT_LINK_HMAC_KEY } = process.env
const live = Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY && CLIENT_LINK_HMAC_KEY)
// eslint-disable-next-line no-console -- the skip reason must be visible in the run output
if (!live) console.warn('payroll start skipped: missing SUPABASE_URL, SUPABASE_SECRET_KEY or CLIENT_LINK_HMAC_KEY')

const VERSION = CONSENT_TEXT.payroll_data.version

describe.skipIf(!live)('payroll start (live; needs SUPABASE_URL, SUPABASE_SECRET_KEY, CLIENT_LINK_HMAC_KEY)', () => {
  const sent: Job[] = []
  const ASSETS = { fetch: async () => new Response('<!doctype html><title>ResSpark</title>', { headers: { 'content-type': 'text/html' } }) }
  const env = {
    ...process.env,
    TRUV_CLIENT_ID: 'test-client',
    TRUV_SECRET: 'test-secret-' + randomUUID(),
    TRUV_TEMPLATE_ID: '',
    JOBS: { send: async (job: Job) => void sent.push(job) },
    ASSETS,
  } as unknown as Env
  let fx: ConnectionFixture
  let cookie = ''
  let connectionId = ''
  let vendor: ReturnType<typeof stubVendorFetch> | undefined

  const get = (path: string, e = env) => app.request(path, { headers: { cookie } }, e)
  const post = (path: string, body: unknown, e = env) =>
    app.request(
      path,
      { method: 'POST', headers: { cookie, 'content-type': 'application/json', 'X-Requested-With': 'ResSpark' }, body: JSON.stringify(body) },
      e
    )
  const json = async (res: Response) => (await res.json()) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  const consents = async () => (await fx.admin.from('consents').select('*').eq('request_id', fx.request_id)).data!
  const consentEvents = async () =>
    (await fx.admin.from('events').select('id').eq('request_id', fx.request_id).eq('action', 'consent.payroll_data')).data!
  const connections = async () => (await fx.admin.from('connections').select('*').eq('request_id', fx.request_id)).data!

  beforeAll(async () => {
    fx = await seedConnectionFixture(env, { kind: 'payroll' })
    await fx.admin.from('connections').delete().eq('provider', 'truv').eq('external_id', 'ord_fixture_new')
    const link = (await fx.admin.from('client_links').select('version').eq('id', fx.link_id).single()).data as { version: number }
    const token = await mintLinkToken(await hmacKey(CLIENT_LINK_HMAC_KEY!), uuidToBytes(fx.link_id), link.version)
    const res = await app.request(`/c/${token}`, { redirect: 'manual' }, env)
    expect(res.status).toBe(302)
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
    expect(cookie).toMatch(/^rs_client=/)
    const order = fixtureText('truv/order_create_response.json')
    const respond = () => new Response(order, { status: 201, headers: { 'content-type': 'application/json' } })
    vendor = stubVendorFetch([
      { host: 'prod.truv.com', path: '/v1/orders/', method: 'POST', respond },
      { host: 'prod.truv.com', path: '/v1/orders/ord_fixture_new/', method: 'GET', respond },
    ])
  })

  afterAll(async () => {
    vendor?.restore()
    if (fx) await fx.cleanup()
  })

  it('reports the provider and no consent or connection yet', async () => {
    const res = await get(`/api/c/items/${fx.item_id}/connection`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ provider: { id: 'truv', configured: true, capabilities: null }, consented: false, connection: null })
  })

  it('refuses to start without consent (409 consent_required) and writes no connection', async () => {
    const res = await post('/api/c/connections/payroll/start', { item_id: fx.item_id })
    expect(res.status).toBe(409)
    expect((await json(res)).error.code).toBe('consent_required')
    expect(await connections()).toHaveLength(0)
    expect(vendor!.calls).toHaveLength(0)
  })

  it('rejects a stale consent version, then records the current one exactly once', async () => {
    const stale = await post('/api/c/consents', { kind: 'payroll_data', text_version: '2020-01-01.1' })
    expect(stale.status).toBe(409)
    expect((await json(stale)).error.code).toBe('consent_text_stale')
    expect(await consents()).toHaveLength(0)

    for (let i = 0; i < 2; i++) {
      const res = await post('/api/c/consents', { kind: 'payroll_data', text_version: VERSION, user_agent_class: 'phone' })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ consented: true })
    }
    const rows = await consents()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ link_id: fx.link_id, kind: 'payroll_data', text_version: VERSION, user_agent_class: 'phone' })
    expect(['ipv4', 'ipv6', 'unknown']).toContain(rows[0].ip_class)
    expect(await consentEvents()).toHaveLength(1)
  })

  it('creates the order after the row and returns the bridge token', async () => {
    const res = await post('/api/c/connections/payroll/start', { item_id: fx.item_id })
    expect(res.status).toBe(200)
    const body = await json(res)
    expect(body).toMatchObject({ kind: 'payroll', provider: 'truv', bridge_token: 'bt_fixture_1' })
    connectionId = body.connection_id
    expect(vendor!.calls).toHaveLength(1)
    const call = vendor!.calls[0]
    expect(call.method).toBe('POST')
    expect(call.url).toBe('https://prod.truv.com/v1/orders/')
    expect(call.headers.get('X-Access-Client-Id')).toBe('test-client')
    expect(call.headers.get('X-Access-Secret')).toBeTruthy()
    const sentBody = (await call.json()) as Record<string, unknown>
    expect(sentBody).toMatchObject({
      products: ['income'],
      external_user_id: fx.request_id,
      order_number: fx.request_id,
      notification_settings: { suppress_user_notifications: true },
      first_name: 'Upload',
      last_name: 'Probe',
    })
    expect(sentBody).not.toHaveProperty('template_id')

    const [row] = await connections()
    expect(row).toMatchObject({ id: connectionId, status: 'pending', external_id: 'ord_fixture_new', provider: 'truv' })
    const started = (await fx.admin.from('events').select('id').eq('request_id', fx.request_id).eq('action', 'connection.started')).data!
    expect(started).toHaveLength(1)
  })

  it('a second tap reuses the open order (same connection, one GET, still one POST)', async () => {
    const res = await post('/api/c/connections/payroll/start', { item_id: fx.item_id })
    expect(res.status).toBe(200)
    expect(await json(res)).toMatchObject({ connection_id: connectionId, bridge_token: 'bt_fixture_1' })
    expect(vendor!.calls.map((r) => r.method)).toEqual(['POST', 'GET'])
    expect(vendor!.calls[1].url).toBe('https://prod.truv.com/v1/orders/ord_fixture_new/')
    expect(await connections()).toHaveLength(1)
  })

  it('the item view shows consent and the pending connection without internals', async () => {
    const res = await get(`/api/c/items/${fx.item_id}/connection`)
    const text = await res.text()
    const body = JSON.parse(text)
    expect(body.consented).toBe(true)
    expect(body.connection).toMatchObject({ id: connectionId, status: 'pending', employers: [] })
    for (const k of ['external_id', 'bridge_token', 'created_at']) expect(text).not.toContain(`"${k}"`)
  })

  it('reconcile enqueues one job (202 queued: true); another id is a 404', async () => {
    const res = await post(`/api/c/connections/${connectionId}/reconcile`, {})
    expect(res.status).toBe(202)
    expect(await res.json()).toEqual({ queued: true })
    expect(sent).toEqual([{ type: 'reconcile', ref: connectionId }])
    const other = await post(`/api/c/connections/${randomUUID()}/reconcile`, {})
    expect(other.status).toBe(404)
    expect(sent).toHaveLength(1)
  })

  it('portal pages carry the content-security-policy for Truv Bridge', async () => {
    const res = await app.request('https://resspark.test/c/', {}, env)
    const csp = res.headers.get('content-security-policy') ?? ''
    expect(csp).toContain('https://cdn.truv.com')
    expect(csp).toContain('https://my.truv.com')
  })

  it('without Truv keys: configured false and start is 503 provider_not_configured', async () => {
    const bare = { ...env, TRUV_CLIENT_ID: '' } as Env
    const view = await json(await get(`/api/c/items/${fx.item_id}/connection`, bare))
    expect(view.provider).toEqual({ id: 'truv', configured: false, capabilities: null })
    const res = await post('/api/c/connections/payroll/start', { item_id: fx.item_id }, bare)
    expect(res.status).toBe(503)
    expect((await json(res)).error.code).toBe('provider_not_configured')
  })
})
