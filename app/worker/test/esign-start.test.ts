import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { listRequestConnections } from '../src/db/connections-ops'
import { createAdminClient } from '../src/db/client'
import { app } from '../src/index'
import { fixtureText } from './fixtures/connections'
import { seedPortalItems, type PortalFixture } from './fixtures/portal-items'
import { stubVendorFetch } from './helpers/vendor-fetch'

// SIGN-01 / SIGN-03 tracer against the live project (test firm only), DocuSeal stubbed:
// cookie -> 409 consent_required (no vendor call) -> esign consent -> start -> row + submission -> reuse.
const { SUPABASE_URL, SUPABASE_SECRET_KEY, CLIENT_LINK_HMAC_KEY } = process.env
const live = Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY && CLIENT_LINK_HMAC_KEY)
// eslint-disable-next-line no-console -- the skip reason must be visible in the run output
if (!live) console.warn('esign start skipped: missing SUPABASE_URL, SUPABASE_SECRET_KEY or CLIENT_LINK_HMAC_KEY')

describe.skipIf(!live)('esign start (live; needs SUPABASE_URL, SUPABASE_SECRET_KEY, CLIENT_LINK_HMAC_KEY)', () => {
  const ASSETS = { fetch: async () => new Response('<!doctype html><title>ResSpark</title>', { headers: { 'content-type': 'text/html' } }) }
  const env = {
    ...process.env,
    DOCUSEAL_API_KEY: 'test-key',
    DOCUSEAL_API_URL: 'https://api.docuseal.com',
    DOCUSEAL_ENV: 'test',
    JOBS: { send: vi.fn() },
    ASSETS,
  } as unknown as Env
  // describe.skipIf still runs this body at collection time, so only build the client when live.
  const admin = live ? createAdminClient(env) : (undefined as unknown as ReturnType<typeof createAdminClient>)
  let fx: PortalFixture
  let cookie = ''
  let savedSettings: Record<string, unknown> = {}
  let vendor: ReturnType<typeof stubVendorFetch> | undefined
  const json = (body: string, status = 200) => () => new Response(body, { status, headers: { 'content-type': 'application/json' } })

  const post = (path: string, body?: unknown) =>
    app.request(
      path,
      {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json', 'X-Requested-With': 'ResSpark' },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      env
    )
  const start = () => post(`/api/c/items/${fx.items.signature}/signature/start`)
  const connections = async () => (await admin.from('connections').select('*').eq('request_id', fx.requestId)).data!

  beforeAll(async () => {
    fx = await seedPortalItems(env, { kinds: ['signature'], logicsCaseId: 900002 })
    const firm = (await admin.from('firms').select('settings').eq('id', fx.firmId).single()).data as { settings: Record<string, unknown> }
    savedSettings = firm.settings ?? {}
    await admin
      .from('firms')
      .update({ settings: { ...savedSettings, esign_templates: { engagement_letter: 1001, form_2848: null, form_8821: null } } })
      .eq('id', fx.firmId)
    cookie = await fx.cookie()
    vendor = stubVendorFetch([
      { host: 'api.docuseal.com', path: '/templates/1001', method: 'GET', respond: json(fixtureText('docuseal/template.json')) },
      { host: 'api.docuseal.com', path: '/submissions', method: 'POST', respond: json(fixtureText('docuseal/submission_create.json')) },
      { host: 'api.docuseal.com', path: '/submitters/5001', method: 'GET', respond: json(fixtureText('docuseal/submitter_pending.json')) },
    ])
  })

  afterAll(async () => {
    vendor?.restore()
    await admin.from('firms').update({ settings: savedSettings }).eq('id', fx.firmId)
    if (fx) await fx.cleanup()
  })

  it('refuses to start before the esign consent and calls nothing', async () => {
    const res = await start()
    expect(res.status).toBe(409)
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('consent_required')
    expect(vendor!.calls).toHaveLength(0)
    expect(await connections()).toHaveLength(0)
  })

  it('records the esign consent once with its event', async () => {
    const res = await post('/api/c/consents', { kind: 'esign', text_version: 'esign-v1' })
    expect(res.status).toBe(200)
    const rows = (await admin.from('consents').select('kind, text_version').eq('request_id', fx.requestId)).data!
    expect(rows).toEqual([{ kind: 'esign', text_version: 'esign-v1' }])
    const events = (await admin.from('events').select('id').eq('request_id', fx.requestId).eq('action', 'consent.esign')).data!
    expect(events).toHaveLength(1)
  })

  it('creates the row, then the submission, and returns only the embed URL to the client', async () => {
    const t0 = Date.now()
    const res = await start()
    // eslint-disable-next-line no-console -- measured latency is recorded in the plan summary
    console.info(`esign start latency: ${Date.now() - t0} ms`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { connection_id: string; embed_src: string }
    expect(body).toEqual({ connection_id: expect.any(String), embed_src: 'https://docuseal.com/s/fixtureSlug1' })

    const link = (await admin.from('client_links').select('expires_at').eq('id', fx.linkId).single()).data as { expires_at: string }
    const create = vendor!.calls.find((r) => r.method === 'POST')!
    const sent = (await create.clone().json()) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(sent).toMatchObject({ template_id: 1001, send_email: false, send_sms: false })
    expect(Date.parse(sent.expire_at)).toBe(Date.parse(link.expires_at))
    expect(sent.submitters).toHaveLength(1)
    expect(sent.submitters[0]).toMatchObject({
      role: 'Client',
      name: 'Morgan Lee',
      email: 'morgan.lee@example.com',
      external_id: fx.items.signature,
      send_email: false,
    })
    expect(sent.submitters[0].fields).toEqual([
      { name: 'Full name', default_value: 'Morgan Lee', readonly: true },
      { name: 'Case ID', default_value: '900002', readonly: true },
    ])
    for (const call of vendor!.calls) expect(call.headers.get('x-auth-token')).toBe('test-key')

    const rows = await connections()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: body.connection_id,
      provider: 'docuseal',
      kind: 'signature',
      status: 'pending',
      external_id: '4001',
      link_ref: 'fixtureSlug1',
      data: { template_key: 'engagement_letter', template_id: 1001, submitter_id: 5001, env: 'test' },
    })
    expect(Date.parse(rows[0].data.expire_at)).toBe(Date.parse(link.expires_at))
    const events = (await admin.from('events').select('action, payload').eq('request_id', fx.requestId)).data!
    expect(events.filter((e) => e.action === 'connection.started')).toHaveLength(1)
    const leaked = JSON.stringify(events) + JSON.stringify(rows[0].data)
    expect(leaked).not.toContain('docuseal.com/s/')
    expect(leaked).not.toContain('fixtureSlug1')
  })

  it('reuses the pending row through GET /submitters on the next start', async () => {
    const before = (await connections())[0].id
    const res = await start()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ connection_id: before, embed_src: 'https://docuseal.com/s/fixtureSlug1' })
    expect(vendor!.calls.filter((r) => r.method === 'POST')).toHaveLength(1)
    expect(vendor!.calls.filter((r) => new URL(r.url).pathname === '/submitters/5001')).toHaveLength(1)
    expect(await listRequestConnections(env, fx.firmId, fx.requestId)).toEqual([])
  })
})
