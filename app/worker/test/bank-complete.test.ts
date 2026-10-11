import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { CONSENT_TEXT } from '../../src/lib/consent-text'
import { hmacKey, mintLinkToken, uuidToBytes } from '../src/auth/client-link'
import { insertConnection, updateConnection } from '../src/db/connections'
import { _setDefaultFirmIdForTests } from '../src/db/webhook-events'
import { app } from '../src/index'
import { openToken } from '../src/integrations/token-vault'
import { queue, type Job } from '../src/jobs/index'
import { reconcileConnection } from '../src/jobs/reconcile'
import { _clearPlaidKeysForTests, _setPlaidKeyForTests } from '../src/webhooks/plaid'
import { fixtureText, seedConnectionFixture, TEST_FIRM_ID, type ConnectionFixture } from './fixtures/connections'
import { makePlaidSigner } from './helpers/plaid-sign'
import { stubVendorFetch } from './helpers/vendor-fetch'

// BANK-01/02 tracer against the live project (test firm 00000000-0000-0000-0000-00000000000e):
// consent -> bank start (row before URL, fresh link token per tap) -> single-use /c/return ->
// signed SESSION_FINISHED -> exchange -> sealed secret -> connected. Only Plaid and ASSETS are stubbed.
const { SUPABASE_URL, SUPABASE_SECRET_KEY, CLIENT_LINK_HMAC_KEY, TOKEN_ENC_KEY_1 } = process.env
const live = Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY && CLIENT_LINK_HMAC_KEY && TOKEN_ENC_KEY_1)
// eslint-disable-next-line no-console -- the skip reason must be visible in the run output
if (!live) console.warn('bank complete skipped: missing SUPABASE_URL, SUPABASE_SECRET_KEY, CLIENT_LINK_HMAC_KEY or TOKEN_ENC_KEY_1')

const VERSION = CONSENT_TEXT.bank_data.version
const LINK_REFS = ['link-sandbox-fixture-1', 'link-sandbox-fixture-2', 'link-sandbox-fixture-3']
const ITEM_IDS = ['item_fixture_1', 'item_fixture_3']
const EVENT_KEYS = ['ls_fixture_1:SESSION_FINISHED', 'ls_fixture_2:SESSION_FINISHED']
const json = (text: string) => new Response(text, { headers: { 'content-type': 'application/json' } })

describe.skipIf(!live)('bank complete (live; needs SUPABASE_URL, SUPABASE_SECRET_KEY, CLIENT_LINK_HMAC_KEY, TOKEN_ENC_KEY_1)', () => {
  const sent: Job[] = []
  const ASSETS = { fetch: vi.fn(async () => new Response('<html>spa</html>', { headers: { 'content-type': 'text/html' } })) }
  const env = {
    ...process.env,
    PLAID_CLIENT_ID: 'test',
    PLAID_SECRET: 'test',
    PLAID_ENV: 'sandbox',
    BANK_PROVIDER: 'plaid',
    PLAID_REMOVE_AFTER_DAYS: '30',
    JOBS: { send: async (job: Job) => void sent.push(job) },
    ASSETS,
  } as unknown as Env
  let fx: ConnectionFixture
  let cookie = ''
  let connectionId = ''
  let firstNonce = ''
  let vendor: ReturnType<typeof stubVendorFetch>
  let signer: Awaited<ReturnType<typeof makePlaidSigner>>

  const get = (path: string) => app.request(path, { headers: { cookie }, redirect: 'manual' }, env)
  const post = (path: string, body: unknown) =>
    app.request(
      path,
      { method: 'POST', headers: { cookie, 'content-type': 'application/json', 'X-Requested-With': 'ResSpark' }, body: JSON.stringify(body) },
      env
    )
  const body = async (res: Response) => (await res.json()) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  const row = async (id: string) => (await fx.admin.from('connections').select('*').eq('id', id).single()).data!
  const paths = () => vendor.calls.map((c) => new URL(c.url).pathname)
  const runQueue = async (job: Job) => {
    const ack = vi.fn()
    const retry = vi.fn()
    await queue({ queue: 'resspark-jobs', messages: [{ body: job, attempts: 1, ack, retry }] } as unknown as MessageBatch<Job>, env)
    expect(ack).toHaveBeenCalledTimes(1)
    expect(retry).not.toHaveBeenCalled()
  }
  const postWebhook = async (raw: string) =>
    app.request(
      '/api/webhooks/plaid',
      { method: 'POST', body: raw, headers: { 'content-type': 'application/json', 'plaid-verification': await signer.sign(raw) } },
      env
    )
  const cleanLeftovers = async () => {
    await fx.admin.from('webhook_events').delete().eq('provider', 'plaid').in('event_key', EVENT_KEYS)
    await fx.admin.from('connections').delete().eq('firm_id', TEST_FIRM_ID).in('link_ref', LINK_REFS)
    await fx.admin.from('connections').delete().eq('firm_id', TEST_FIRM_ID).eq('provider', 'plaid').in('external_id', ITEM_IDS)
  }

  beforeAll(async () => {
    _setDefaultFirmIdForTests(TEST_FIRM_ID)
    fx = await seedConnectionFixture(env, { kind: 'bank' })
    await cleanLeftovers()
    signer = await makePlaidSigner()
    _setPlaidKeyForTests(signer.kid, signer.jwk)
    const link = (await fx.admin.from('client_links').select('version').eq('id', fx.link_id).single()).data as { version: number }
    const token = await mintLinkToken(await hmacKey(CLIENT_LINK_HMAC_KEY!), uuidToBytes(fx.link_id), link.version)
    const res = await app.request(`/c/${token}`, { redirect: 'manual' }, env)
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
    expect(cookie).toMatch(/^rs_client=/)
    const getFixture = JSON.parse(fixtureText('plaid/link_token_get.json'))
    getFixture.link_sessions[0].results.item_add_results[0].public_token = 'public-sandbox-fixture-3'
    vendor = stubVendorFetch([
      { host: 'sandbox.plaid.com', path: '/link/token/create', respond: () => json(fixtureText('plaid/link_token_create.json')) },
      { host: 'sandbox.plaid.com', path: '/link/token/get', respond: () => Response.json(getFixture) },
      {
        host: 'sandbox.plaid.com',
        path: '/item/public_token/exchange',
        respond: async (req) => {
          const { public_token } = (await req.json()) as { public_token: string }
          if (public_token === 'public-sandbox-fixture-1') return json(fixtureText('plaid/exchange.json'))
          return Response.json({ access_token: 'access-sandbox-fixture-3', item_id: 'item_fixture_3' })
        },
      },
    ])
  })

  afterAll(async () => {
    vendor?.restore()
    _clearPlaidKeysForTests()
    _setDefaultFirmIdForTests(null)
    if (!fx) return
    await fx.admin.from('webhook_events').delete().eq('provider', 'plaid').in('event_key', EVENT_KEYS)
    await fx.cleanup() // connection_secrets cascade with connections
  })

  it('reports Plaid with its capabilities', async () => {
    const res = await get(`/api/c/items/${fx.item_id}/connection`)
    expect((await body(res)).provider).toEqual({
      id: 'plaid',
      configured: true,
      capabilities: { transactions: true, statementPdfs: true, hostedLink: true },
    })
  })

  it('start without consent is 409 consent_required; after consent it mints the D-08 link token', async () => {
    const refused = await post('/api/c/connections/bank/start', { item_id: fx.item_id })
    expect(refused.status).toBe(409)
    expect((await body(refused)).error.code).toBe('consent_required')
    expect((await post('/api/c/consents', { kind: 'bank_data', text_version: VERSION })).status).toBe(200)

    const res = await post('/api/c/connections/bank/start', { item_id: fx.item_id })
    expect(res.status).toBe(200)
    const out = await body(res)
    expect(out).toMatchObject({ kind: 'bank', provider: 'plaid', hosted_link_url: 'https://secure.plaid.com/hl/fixture' })
    expect(out.capabilities).toEqual({ transactions: true, statementPdfs: true, hostedLink: true })
    connectionId = out.connection_id

    const sentBody = (await vendor.calls[0].json()) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    console.info('link/token/create body', JSON.stringify({ ...sentBody, user: '<request id>' })) // eslint-disable-line no-console
    expect(sentBody.products).toEqual(['transactions'])
    expect(sentBody.required_if_supported_products).toEqual(['statements'])
    expect(sentBody.transactions.days_requested).toBe(365)
    const days = (Date.parse(sentBody.statements.end_date) - Date.parse(sentBody.statements.start_date)) / 86_400_000
    expect(days).toBe(180)
    expect(sentBody.statements.end_date).toBe(new Date().toISOString().slice(0, 10))
    expect(sentBody.hosted_link.url_lifetime_seconds).toBe(1800)
    expect(sentBody.hosted_link.is_mobile_app).toBe(false)
    expect(sentBody.hosted_link.completion_redirect_uri).toMatch(/^http:\/\/localhost\/c\/return\?nonce=[A-Za-z0-9_-]{22}$/)
    expect(sentBody.webhook).toMatch(/\/api\/webhooks\/plaid$/)
    expect(sentBody.user.client_user_id).toBe(fx.request_id)
    const firm = (await fx.admin.from('firms').select('name').eq('id', TEST_FIRM_ID).single()).data as { name: string }
    expect(sentBody.client_name).toBe(firm.name)

    const r = await row(connectionId)
    expect(r).toMatchObject({ status: 'pending', link_ref: 'link-sandbox-fixture-1' })
    expect(r.return_nonce).toHaveLength(22)
    firstNonce = r.return_nonce
  })

  it('a second tap reuses the row but mints a new token and a new nonce', async () => {
    const res = await post('/api/c/connections/bank/start', { item_id: fx.item_id })
    expect((await body(res)).connection_id).toBe(connectionId)
    expect(paths().filter((p) => p === '/link/token/create')).toHaveLength(2)
    expect((await fx.admin.from('connections').select('id').eq('request_item_id', fx.item_id)).data).toHaveLength(1)
    expect((await row(connectionId)).return_nonce).not.toBe(firstNonce)
  })

  it('/c/return: old nonce is dead, new nonce is single-use, no nonce serves the SPA, status untouched', async () => {
    const old = await get(`/c/return?nonce=${firstNonce}`)
    expect(old.status).toBe(302)
    expect(old.headers.get('location')).toBe('/c/return')
    expect(sent).toHaveLength(0)

    const nonce = (await row(connectionId)).return_nonce
    const fresh = await get(`/c/return?nonce=${nonce}`)
    expect(fresh.status).toBe(302)
    expect(sent).toEqual([{ type: 'reconcile', ref: connectionId }])
    expect((await row(connectionId)).return_nonce_used_at).toBeTruthy()
    const returned = (await fx.admin.from('events').select('id').eq('request_id', fx.request_id).eq('action', 'connection.returned')).data!
    expect(returned).toHaveLength(1)

    expect((await get(`/c/return?nonce=${nonce}`)).status).toBe(302)
    expect(sent).toHaveLength(1)

    const spa = await get('/c/return')
    expect(spa.status).toBe(200)
    expect(ASSETS.fetch).toHaveBeenCalled()

    const junk = await get('/c/return?nonce=x')
    expect(junk.status).toBe(302)
    expect(await junk.text()).not.toContain('invalid')
    expect((await row(connectionId)).status).toBe('pending')
    sent.length = 0
  })

  it('a signed SESSION_FINISHED SUCCESS exchanges the token into the vault and connects', async () => {
    const res = await postWebhook(fixtureText('plaid/session_finished_success.json'))
    expect(res.status).toBe(200)
    expect(sent).toHaveLength(1)
    await runQueue(sent[0])

    const exchange = vendor.calls.filter((c) => c.url.endsWith('/item/public_token/exchange'))
    expect(exchange).toHaveLength(1)
    expect(((await exchange[0].json()) as { public_token: string }).public_token).toBe('public-sandbox-fixture-1')
    expect(paths()).not.toContain('/link/token/get')

    const secrets = (await fx.admin.from('connection_secrets').select('ciphertext, iv, key_version').eq('connection_id', connectionId)).data!
    expect(secrets).toHaveLength(1)
    expect(secrets[0].key_version).toBe(1)
    expect(secrets[0].iv).toMatch(/^[A-Za-z0-9_-]{16}$/)
    expect(await openToken(env, connectionId, secrets[0])).toBe('access-sandbox-fixture-1')
    await expect(openToken(env, randomUUID(), secrets[0])).rejects.toThrow('decrypt_failed')

    const r = await row(connectionId)
    expect(r).toMatchObject({ status: 'connected', external_id: 'item_fixture_1' })
    expect(r.connected_at).toBeTruthy()
    const offset = Date.parse(r.remove_after) - Date.now()
    console.info(`remove_after offset: ${(offset / 86_400_000).toFixed(4)} days`) // eslint-disable-line no-console
    expect(Math.abs(offset - 30 * 86_400_000)).toBeLessThan(3_600_000)
    expect((await fx.admin.from('request_items').select('status').eq('id', fx.item_id).single()).data!.status).toBe('submitted')

    const events = (await fx.admin.from('events').select('action, payload').eq('request_id', fx.request_id)).data!
    expect(events.map((e) => e.action)).toContain('connection.connected')
    const all = JSON.stringify(events)
    expect(all).not.toContain('access-sandbox-fixture-1')
    expect(all).not.toContain('public-sandbox-fixture-1')
  })

  it('an EXITED session records session_exited and stays pending without a secret', async () => {
    const conn = await insertConnection(env, {
      firm_id: fx.firm_id,
      request_id: fx.request_id,
      request_item_id: fx.item_id,
      case_id: fx.case_id,
      provider: 'plaid',
      kind: 'bank',
      link_ref: 'link-sandbox-fixture-2',
    })
    sent.length = 0
    expect((await postWebhook(fixtureText('plaid/session_finished_exited.json'))).status).toBe(200)
    await runQueue(sent[0])
    expect((await row(conn.id)).status).toBe('pending')
    const exited = (await fx.admin.from('events').select('id').eq('request_id', fx.request_id).eq('action', 'connection.session_exited')).data!
    expect(exited).toHaveLength(1)
    expect((await fx.admin.from('connection_secrets').select('connection_id').eq('connection_id', conn.id)).data).toHaveLength(0)
  })

  it('a missed webhook is recovered by the cron through /link/token/get', async () => {
    const conn = await insertConnection(env, {
      firm_id: fx.firm_id,
      request_id: fx.request_id,
      request_item_id: fx.item_id,
      case_id: fx.case_id,
      provider: 'plaid',
      kind: 'bank',
    })
    await updateConnection(env, conn.id, { link_ref: 'link-sandbox-fixture-3' })
    const before = vendor.calls.length
    await reconcileConnection(env, conn.id, { source: 'cron' })
    const newCalls = vendor.calls.slice(before)
    expect(newCalls.map((c) => new URL(c.url).pathname)).toEqual(['/link/token/get', '/item/public_token/exchange'])
    expect(((await newCalls[0].json()) as { link_token: string }).link_token).toBe('link-sandbox-fixture-3')
    const r = await row(conn.id)
    expect(r).toMatchObject({ status: 'connected', external_id: 'item_fixture_3' })
    expect(r.data.institution_name).toBe('First Platypus Bank')
  })
})
