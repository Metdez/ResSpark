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

// Plan 07 appends `/c/` checks here.
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
