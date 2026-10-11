// Deployed full-stack check: node app/scripts/smoke.mjs <baseUrl> [--auth] [--client-flow]
// Prints `ok <name>` or `FAIL <name>: <reason>` per check; exits 1 if any check fails.
const args = process.argv.slice(2)
const baseUrl = args.find((a) => !a.startsWith('--'))
if (!baseUrl) {
  console.error('usage: node app/scripts/smoke.mjs <baseUrl> [--auth] [--client-flow]')
  process.exit(1)
}
const base = baseUrl.replace(/\/$/, '')
const withClientFlow = args.includes('--client-flow')
const withAuth = args.includes('--auth') || withClientFlow

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

async function expectJson(res, status, test) {
  if (res.status !== status) throw new Error(`status ${res.status}, expected ${status}`)
  const body = await res.json()
  if (!isObject(body) || !test(body)) throw new Error(`unexpected body ${JSON.stringify(body)}`)
}

const isNotFoundEnvelope = (body) =>
  isObject(body.error) && body.error.code === 'not_found'

// --auth: one real password sign-in against Supabase; the token is reused and never printed.
const env = process.env
let accessToken
async function staffToken() {
  if (accessToken) return accessToken
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL
  const key = env.SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key || !env.DEMO_STAFF_EMAIL || !env.DEMO_STAFF_PASSWORD) {
    throw new Error('missing SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY / DEMO_STAFF_* in env')
  }
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: key, 'content-type': 'application/json' },
    body: JSON.stringify({ email: env.DEMO_STAFF_EMAIL, password: env.DEMO_STAFF_PASSWORD }),
  })
  if (res.status !== 200) throw new Error(`staff sign-in status ${res.status}`)
  const body = await res.json()
  if (typeof body.access_token !== 'string') throw new Error('staff sign-in returned no token')
  accessToken = body.access_token
  return accessToken
}
const SESSION_PATH = '/api/admin/session'
const session = (init) => fetch(base + SESSION_PATH, init)
const signedIn = JSON.stringify({ event: 'signed_in' })
// Plan 02-03: the shared fixture phone; lookup result bodies are never printed.
const lookupFixture = (headers) =>
  fetch(`${base}/api/admin/lookup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ type: 'phone', value: '(555)010-0001' }),
  })

// --- Plan 07: client-link checks (/c/*) ---
function expectPrivacyHeaders(res) {
  const cacheControl = res.headers.get('cache-control') ?? ''
  if (!cacheControl.includes('no-store')) throw new Error(`cache-control ${cacheControl}`)
  if (res.headers.get('referrer-policy') !== 'no-referrer') throw new Error('referrer-policy missing')
  if (res.headers.get('x-robots-tag') !== 'noindex') throw new Error('x-robots-tag missing')
}
const invalidLink = () => fetch(`${base}/c/not-a-valid-token`, { redirect: 'manual' })

// --auth: seeds a probe link through the 0003 RPCs (same fixture case as requests-live.test.ts),
// mints its token with CLIENT_LINK_HMAC_KEY, runs `body({ db, link, token })`, then deletes the
// probe request (cascading the link and its client_sessions row). The token is never printed.
async function withProbeLink(body) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY || !env.CLIENT_LINK_HMAC_KEY) {
    throw new Error('missing SUPABASE_URL / SUPABASE_SECRET_KEY / CLIENT_LINK_HMAC_KEY in env')
  }
  const { createClient } = await import('@supabase/supabase-js')
  const { createHmac } = await import('node:crypto')
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })
  const firm = '00000000-0000-0000-0000-000000000001'
  const rpc = async (fn, args) => {
    const { data, error } = await db.rpc(fn, args)
    if (error) throw new Error(`${fn} failed`)
    return data
  }
  const caseId = await rpc('case_confirm_logics', {
    p_firm_id: firm, p_logics_case_id: 999999001, p_first_name: 'Live', p_last_name: 'Probe',
    p_email: 'live.probe@example.com', p_phone_e164: '+15550109999', p_snapshot: { source: 'smoke' },
    p_actor_id: null, p_search_type: 'phone',
  })
  const requestId = await rpc('request_create', {
    p_firm_id: firm, p_case_id: caseId, p_template_name: 'Documents only',
    p_items: [{ kind: 'upload', label: 'Smoke probe', required: true, config: {} }],
    p_created_by: null, p_agent_display_name: 'Smoke Probe',
  })
  try {
    const [link] = await rpc('request_send', {
      p_request_id: requestId, p_firm_id: firm, p_actor_id: null,
      p_contact_email: 'live.probe@example.com', p_contact_phone_e164: '+15550109999',
    })
    const id = Buffer.from(link.link_id.replace(/-/g, ''), 'hex')
    const version = Buffer.alloc(4)
    version.writeUInt32BE(link.version)
    const mac = createHmac('sha256', Buffer.from(env.CLIENT_LINK_HMAC_KEY, 'utf8'))
      .update(Buffer.concat([id, version]))
      .digest()
    await body({ db, link, token: Buffer.concat([id, mac]).toString('base64url') })
  } finally {
    await db.from('requests').delete().eq('id', requestId)
  }
}

const linkExchange = () =>
  withProbeLink(async ({ db, link, token }) => {
    const res = await fetch(`${base}/c/${token}`, { redirect: 'manual' })
    if (res.status !== 302) throw new Error(`status ${res.status}, expected 302`)
    if (res.headers.get('location') !== '/c/') throw new Error('location is not /c/')
    const cookie = res.headers.get('set-cookie') ?? ''
    for (const part of ['rs_client=', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=86400']) {
      if (!cookie.includes(part)) throw new Error(`cookie lacks ${part}`)
    }
    if (cookie.includes(token)) throw new Error('cookie contains the token')
    expectPrivacyHeaders(res)
    const { data: row } = await db.from('client_links').select('opened_at').eq('id', link.link_id).single()
    if (!row || row.opened_at !== null) throw new Error('opened_at was written')
  })

// Plan 02-07, --auth: exchange a probe link for the cookie, then drive /api/c/state, /start (twice)
// and /heartbeat on the deployed Worker and check the rows they wrote. The cookie is never printed.
const clientPortal = () =>
  withProbeLink(async ({ db, link, token }) => {
    const exchanged = await fetch(`${base}/c/${token}`, { redirect: 'manual' })
    const cookie = (exchanged.headers.get('set-cookie') ?? '').split(';')[0]
    if (!cookie.startsWith('rs_client=')) throw new Error('no rs_client cookie')
    const call = (path, method = 'GET', body) =>
      fetch(`${base}/api/c${path}`, {
        method,
        headers: { cookie, 'x-requested-with': 'ResSpark', 'content-type': 'application/json' },
        body: body && JSON.stringify(body),
      })
    const stateRes = await call('/state')
    expectPrivacyHeaders(stateRes)
    await expectJson(stateRes, 200, (b) =>
      b.firm_name === 'ValorTax' && b.opened_at === null && b.steps.length === 1 && !('request_id' in b)
    )
    const opened = await linkRow(db, link.link_id)
    if (opened.opened_at !== null) throw new Error('GET /api/c/state marked the link opened')
    const first = await (await call('/start', 'POST')).json()
    const second = await (await call('/start', 'POST')).json()
    if (typeof first.opened_at !== 'string' || second.opened_at !== first.opened_at) {
      throw new Error('start is not idempotent')
    }
    if ((await linkRow(db, link.link_id)).opened_at === null) throw new Error('start did not set opened_at')
    const beat = await call('/heartbeat', 'POST', { last_step: 'smoke', user_agent_class: 'desktop' })
    await expectJson(beat, 200, (b) => b.ok === true)
    const { data: session } = await db.from('client_sessions').select('last_step').eq('link_id', link.link_id).single()
    if (session?.last_step !== 'smoke') throw new Error('heartbeat row missing')
  })
const linkRow = async (db, id) =>
  (await db.from('client_links').select('opened_at').eq('id', id).single()).data ?? {}

// Plan 02-04, --auth, fake mode only: confirm fixture 900001, create a "Documents only" draft, send
// it to the fixture contact, open the returned URL, record a copy, try email, then delete the
// probe request (cascading items and link). The URL and token are never printed.
async function requestSend() {
  const headers = { authorization: `Bearer ${await staffToken()}`, 'content-type': 'application/json' }
  const api = async (method, path, body, status = 200) => {
    const res = await fetch(`${base}/api/admin${path}`, { method, headers, body: body && JSON.stringify(body) })
    if (res.status !== status) throw new Error(`${method} ${path.replace(/[0-9a-f-]{36}/, ':id')} status ${res.status}`)
    return res.json()
  }
  const { mode } = await api('GET', '/integrations/logics')
  if (mode !== 'fake') throw new Error('needs LOGICS_MODE=fake (live mode is covered by Plan 08)')
  const { case_id } = await api('POST', '/cases/900001/confirm', { search_type: 'case_id' })
  const { templates } = await api('GET', '/requests/templates')
  const template = templates.find((t) => t.name === 'Documents only')
  if (!template) throw new Error('Documents only template missing')
  const { request_id } = await api(
    'POST', '/requests', { case_id, template_id: template.id, items: template.items }, 201
  )
  try {
    const sent = await api('POST', `/requests/${request_id}/send`, {
      email: 'jordan.rivera@example.com', phone: '(555) 010-0001',
    })
    if (!/^[A-Za-z0-9_-]{64}$/.test(sent.url.slice(`${base}/c/`.length))) throw new Error('url is not origin/c/<token>')
    if (sent.version !== 1) throw new Error(`version ${sent.version}`)
    const open = await fetch(sent.url, { redirect: 'manual' })
    if (open.status !== 302) throw new Error(`opening the link: status ${open.status}`)
    const copied = await api('POST', `/requests/${request_id}/copied`)
    if (copied.ok !== true) throw new Error('copied not recorded')
    const email = await api('POST', `/requests/${request_id}/email`)
    if (email.ok !== true && email.reason !== 'not_configured') throw new Error(`email ${email.reason}`)
    // Plan 03-03: the staff review read, an approve refused before any upload, and the case timeline.
    const review = await api('GET', `/requests/${request_id}/review`)
    if (review.request.id !== request_id || review.items.length === 0) throw new Error('review has no items')
    if (review.items.some((i) => i.documents.length !== 0)) throw new Error('review lists files before any upload')
    // null until the portal's first heartbeat writes client_sessions; the join itself is proven in review-live.test.ts
    if (review.client_session !== null && typeof review.client_session.seen_at !== 'string') throw new Error('bad client_session')
    const refused = await api('POST', `/items/${review.items[0].id}/approve`, undefined, 409)
    if (refused.error?.code !== 'item_not_submitted') throw new Error(`approve ${refused.error?.code}`)
    const { events } = await api('GET', `/cases/${case_id}/events?limit=5`)
    if (!events.some((e) => e.request_id === request_id && e.action === 'request.sent')) throw new Error('timeline lacks request.sent')
  } finally {
    const { createClient } = await import('@supabase/supabase-js')
    const db = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })
    await db.from('requests').delete().eq('id', request_id)
  }
}

const checks = [
  {
    name: '/admin',
    run: async () => {
      const res = await fetch(`${base}/admin`)
      if (res.status !== 200) throw new Error(`status ${res.status}`)
      const type = res.headers.get('content-type') ?? ''
      if (!type.includes('text/html')) throw new Error(`content-type ${type}`)
      const html = await res.text()
      if (!html.includes('<div id="root"')) throw new Error('no <div id="root"')
    },
  },
  {
    name: '/api/config',
    run: async () => {
      const res = await fetch(`${base}/api/config`)
      await expectJson(
        res,
        200,
        (b) => typeof b.app_env === 'string' && typeof b.logics_write_enabled === 'boolean'
      )
    },
  },
  {
    name: '/webhooks 404 json',
    run: async () => expectJson(await fetch(`${base}/webhooks/smoke-probe`), 404, isNotFoundEnvelope),
  },
  {
    name: '/api 404 json',
    run: async () => expectJson(await fetch(`${base}/api/nope`), 404, isNotFoundEnvelope),
  },
  {
    name: '/c/ 404 html',
    run: async () => {
      const res = await invalidLink()
      if (res.status !== 404) throw new Error(`status ${res.status}`)
      const type = res.headers.get('content-type') ?? ''
      if (!type.includes('text/html')) throw new Error(`content-type ${type}`)
      if (!(await res.text()).includes("This link isn't active")) throw new Error('no invalid-link copy')
    },
  },
  { name: '/c/ headers', run: async () => expectPrivacyHeaders(await invalidLink()) },
  {
    name: '/c/ spa',
    run: async () => {
      const res = await fetch(`${base}/c/`)
      if (res.status !== 200) throw new Error(`status ${res.status}`)
      if (!(await res.text()).includes('<div id="root"')) throw new Error('no <div id="root"')
      expectPrivacyHeaders(res)
    },
  },
  // --- Plan 02-07: client portal API without a cookie ---
  {
    name: '/api/c 401 no_session',
    run: async () => {
      const res = await fetch(`${base}/api/c/state`)
      expectPrivacyHeaders(res)
      await expectJson(res, 401, (b) => isObject(b.error) && b.error.code === 'no_session')
    },
  },
  {
    name: '/api/c start 401',
    run: async () => {
      const res = await fetch(`${base}/api/c/start`, { method: 'POST', headers: { 'x-requested-with': 'ResSpark' } })
      expectPrivacyHeaders(res)
      await expectJson(res, 401, (b) => isObject(b.error) && b.error.code === 'no_session')
    },
  },
  // --- Plan 04-02: webhook route and staff connections without credentials ---
  {
    name: 'webhooks truv 401',
    run: async () => {
      const res = await fetch(`${base}/api/webhooks/truv`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      await expectJson(res, 401, (b) => isObject(b.error) && b.error.code === 'invalid_signature')
    },
  },
  {
    name: 'webhooks unknown 404',
    run: async () =>
      expectJson(await fetch(`${base}/api/webhooks/nope`, { method: 'POST', body: '{}' }), 404, isNotFoundEnvelope),
  },
  {
    name: 'admin connections 401',
    run: async () => {
      const res = await fetch(`${base}/api/admin/requests/00000000-0000-0000-0000-000000000000/connections`)
      await expectJson(res, 401, (b) => isObject(b.error) && b.error.code === 'unauthorized')
    },
  },
  { name: 'auth /c/ exchange', auth: true, run: linkExchange },
  { name: 'auth /api/c portal', auth: true, run: clientPortal },
  {
    name: 'auth signed_in',
    auth: true,
    run: async () => {
      const headers = { authorization: `Bearer ${await staffToken()}`, 'content-type': 'application/json' }
      const res = await session({ method: 'POST', headers, body: signedIn })
      await expectJson(res, 200, (b) => b.ok === true && typeof b.event_id === 'number')
    },
  },
  {
    name: 'auth session',
    auth: true,
    run: async () => {
      const res = await session({ headers: { authorization: `Bearer ${await staffToken()}` } })
      await expectJson(res, 200, (b) => typeof b.firm_id === 'string')
    },
  },
  {
    name: 'auth 401 without token',
    auth: true,
    run: async () => {
      const res = await session({ method: 'POST', headers: { 'content-type': 'application/json' }, body: signedIn })
      await expectJson(res, 401, (b) => isObject(b.error) && b.error.code === 'unauthorized')
    },
  },
  // --- Plan 02-03: Logics lookup in fixture mode ---
  {
    name: 'auth integrations status',
    auth: true,
    run: async () => {
      const headers = { authorization: `Bearer ${await staffToken()}` }
      const res = await fetch(`${base}/api/admin/integrations/logics`, { headers })
      await expectJson(res, 200, (b) => b.mode === 'fake' || b.mode === 'live')
    },
  },
  {
    name: 'auth lookup fixture',
    auth: true,
    run: async () => {
      const res = await lookupFixture({ authorization: `Bearer ${await staffToken()}` })
      if (res.status !== 200) throw new Error(`status ${res.status}`)
      const body = await res.json()
      if (!isObject(body) || !Array.isArray(body.results)) throw new Error('no results array')
      // In live mode the fixture phone is not a real case, so only fake mode pins the count.
      if (body.mode === 'fake' && body.results.length !== 2) {
        throw new Error(`${body.results.length} results, expected 2`)
      }
    },
  },
  { name: 'auth request send', auth: true, run: requestSend },
  {
    name: 'lookup 401 without token',
    run: async () => {
      const res = await lookupFixture({})
      await expectJson(res, 401, (b) => isObject(b.error) && b.error.code === 'unauthorized')
    },
  },
]

let failed = false
for (const check of checks) {
  if (check.auth && !withAuth) continue
  try {
    await check.run()
    console.log(`ok ${check.name}`)
  } catch (error) {
    failed = true
    console.log(`FAIL ${check.name}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// Plan 02-08, --client-flow (fake mode): the whole phase as staff and client would do it, on fixture
// case 900003. Stops at the first failing step. Prints step names and the request id only, never
// the link URL, token, or cookie. The probe request is revoked, then deleted; its events remain.
async function clientFlow() {
  const headers = { authorization: `Bearer ${await staffToken()}`, 'content-type': 'application/json' }
  const admin = async (method, path, body, status = 200) => {
    const res = await fetch(`${base}/api/admin${path}`, { method, headers, body: body && JSON.stringify(body) })
    if (res.status !== status) throw new Error(`status ${res.status}, expected ${status}`)
    return res.json()
  }
  let cookie = ''
  const client = (path, method = 'GET', body, csrf = true) =>
    fetch(`${base}/api/c${path}`, {
      method,
      headers: { cookie, 'content-type': 'application/json', ...(csrf ? { 'X-Requested-With': 'ResSpark' } : {}) },
      body: body && JSON.stringify(body),
    })
  let step = 'lookup'
  let requestId
  const ok = (next) => {
    console.log(`ok client-flow ${step}`)
    step = next
  }
  try {
    const { results } = await admin('POST', '/lookup', { type: 'phone', value: '(555)010-0003' })
    if (results.length !== 1 || results[0].logics_case_id !== 900003) throw new Error('expected one result, 900003')
    ok('confirm')
    const { case_id } = await admin('POST', '/cases/900003/confirm', { search_type: 'phone' })
    if (typeof case_id !== 'string') throw new Error('no case_id')
    ok('templates')
    const { templates } = await admin('GET', '/requests/templates')
    const template = templates.find((t) => t.name === 'Standard resolution packet')
    if (!template) throw new Error('Standard resolution packet missing')
    ok('create')
    ;({ request_id: requestId } = await admin(
      'POST', '/requests', { case_id, template_id: template.id, items: template.items }, 201
    ))
    ok('send')
    const { url } = await admin('POST', `/requests/${requestId}/send`, {
      email: 'morgan.lee@example.com', phone: '(555) 010-0003',
    })
    if (!/^https:\/\/.+\/c\/[A-Za-z0-9_-]{64}$/.test(url)) throw new Error('url is not https://<host>/c/<token>')
    const token = url.slice(url.lastIndexOf('/') + 1)
    ok('exchange 302')
    const exchanged = await fetch(url, { redirect: 'manual' })
    if (exchanged.status !== 302) throw new Error(`status ${exchanged.status}`)
    if (exchanged.headers.get('location') !== '/c/') throw new Error('location is not /c/')
    cookie = (exchanged.headers.getSetCookie().find((c) => c.startsWith('rs_client=')) ?? '').split(';')[0]
    if (!cookie) throw new Error('no rs_client cookie')
    if ((await exchanged.text()).includes(token)) throw new Error('body contains the token')
    ok('state unopened')
    const unopened = await client('/state')
    if (unopened.status !== 200) throw new Error(`status ${unopened.status}`)
    const text = await unopened.text()
    const state = JSON.parse(text)
    if (state.steps.length !== 5 || state.opened_at !== null || state.firm_name !== 'ValorTax') {
      throw new Error(`steps ${state.steps.length}, opened_at ${state.opened_at}, firm ${state.firm_name}`)
    }
    if (/morgan\.lee|010-0003|5550100003/.test(text)) throw new Error('state contains contact details')
    ok('start csrf 403')
    const bare = await client('/start', 'POST', undefined, false)
    if (bare.status !== 403) throw new Error(`status ${bare.status} without X-Requested-With`)
    ok('start')
    const started = await client('/start', 'POST')
    if (started.status !== 200 || typeof (await started.json()).opened_at !== 'string') throw new Error('no opened_at')
    ok('state opened')
    const opened = await (await client('/state')).json()
    if (!opened.opened_at || opened.status !== 'opened') throw new Error(`status ${opened.status}`)
    ok('heartbeat')
    const beat = await client('/heartbeat', 'POST', { last_step: 'list', user_agent_class: 'desktop' })
    if (beat.status !== 200) throw new Error(`status ${beat.status}`)
    ok('admin opened')
    const detail = await admin('GET', `/requests/${requestId}`)
    if (detail.status !== 'opened' || !detail.link?.opened_at) throw new Error(`status ${detail.status}`)
    ok('revoke')
    await admin('POST', `/requests/${requestId}/revoke`)
    ok('revoke 401')
    const revoked = await client('/state')
    if (revoked.status !== 401) throw new Error(`status ${revoked.status}`)
    ok('exchange 404')
    const dead = await fetch(url, { redirect: 'manual' })
    if (dead.status !== 404) throw new Error(`status ${dead.status}`)
    if (!(await dead.text()).includes("This link isn't active")) throw new Error('no invalid-link copy')
    ok('complete')
    console.log(`ok client-flow complete request ${requestId}`)
    return true
  } catch (error) {
    console.log(`FAIL client-flow ${step}: ${error instanceof Error ? error.message : String(error)}`)
    return false
  } finally {
    if (requestId) {
      const { createClient } = await import('@supabase/supabase-js')
      const db = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })
      await db.from('requests').delete().eq('id', requestId)
    }
  }
}
if (withClientFlow && !(await clientFlow())) failed = true
process.exit(failed ? 1 : 0)
