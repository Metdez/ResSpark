// Deployed full-stack check: node app/scripts/smoke.mjs <baseUrl> [--auth]
// Prints `ok <name>` or `FAIL <name>: <reason>` per check; exits 1 if any check fails.
const args = process.argv.slice(2)
const baseUrl = args.find((a) => !a.startsWith('--'))
if (!baseUrl) {
  console.error('usage: node app/scripts/smoke.mjs <baseUrl> [--auth]')
  process.exit(1)
}
const base = baseUrl.replace(/\/$/, '')
const withAuth = args.includes('--auth')

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
// mints its token with CLIENT_LINK_HMAC_KEY, exchanges it on the deployed Worker, then deletes
// the probe request (cascading the link). The token is never printed.
async function linkExchange() {
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
    const token = Buffer.concat([id, mac]).toString('base64url')
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
  } finally {
    await db.from('requests').delete().eq('id', requestId)
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
  { name: 'auth /c/ exchange', auth: true, run: linkExchange },
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
process.exit(failed ? 1 : 0)
