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

// Plans 06/07 append `/c/` and `--auth` checks here.
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
