// Plan 04-07, --connect-flow: consent, both start routes, /c/return and the staff list on the deployed
// Worker, in whichever mode the secrets allow. Called by smoke.mjs between `admin opened` and
// `revoke`. Prints ids and status codes only, never a bridge token, Hosted Link URL or cookie.
import { readFileSync } from 'node:fs'

// The SPA and Worker share this wording version; reading it here keeps the smoke in step with it.
const consentSource = readFileSync(new URL('../src/lib/consent-text.ts', import.meta.url), 'utf8')
export const consentVersion = (kind) => {
  const match = consentSource.match(new RegExp(`${kind}: \\{\\s*version: '([^']+)'`))
  if (!match) throw new Error(`no ${kind} version in consent-text.ts`)
  return match[1]
}

/** Returns the mode string for the final line; throws an error already printed as FAIL. */
export async function connectFlow({ base, client, staffHeaders, steps, requestId }) {
  let step = 'items'
  const ok = (line, next) => {
    console.log(`ok connect-flow ${line}`)
    step = next
  }
  const json = async (res, status) => {
    if (res.status !== status) throw new Error(`status ${res.status}, expected ${status}`)
    return res.json()
  }
  try {
    const item = (kind) => steps.find((s) => s.kind === kind)?.id
    const items = { payroll: item('payroll_connect'), bank: item('bank_connect') }
    if (!items.payroll || !items.bank) throw new Error('state lacks payroll_connect or bank_connect')
    step = 'payroll provider'
    const configured = {}
    for (const kind of ['payroll', 'bank']) {
      const view = await json(await client(`/items/${items[kind]}/connection`), 200)
      if (kind === 'bank' && (view.provider?.id !== 'plaid' || view.provider.capabilities?.statementPdfs !== true)) {
        throw new Error(`bank provider ${view.provider?.id}, statementPdfs ${view.provider?.capabilities?.statementPdfs}`)
      }
      configured[kind] = view.provider?.configured === true
      ok(`${kind} provider configured: ${configured[kind] ? 'yes' : 'no'}`, 'bank provider')
    }
    step = 'consents'
    for (const kind of ['payroll_data', 'payroll_data', 'bank_data']) {
      const body = await json(await client('/consents', 'POST', { kind, text_version: consentVersion(kind) }), 200)
      if (body.consented !== true) throw new Error(`${kind} not consented`)
    }
    ok('consents', 'payroll start')
    const started = {}
    for (const [kind, field] of [['payroll', 'bridge_token'], ['bank', 'hosted_link_url']]) {
      step = `${kind} start`
      const res = await client(`/connections/${kind}/start`, 'POST', { item_id: items[kind] })
      if (!configured[kind]) {
        const body = await json(res, 503)
        if (body.error?.code !== 'provider_not_configured') throw new Error(`code ${body.error?.code}`)
        ok(`${kind} start 503 (no keys)`)
        continue
      }
      const body = await json(res, 200)
      const value = body[field]
      if (typeof value !== 'string' || (kind === 'bank' && !value.startsWith('https://'))) throw new Error(`no ${field}`)
      started[kind] = body.connection_id
      ok(`${kind} start 200 connection ${body.connection_id}`)
    }
    if (started.bank) {
      step = 'bank pending'
      const view = await json(await client(`/items/${items.bank}/connection`), 200)
      if (view.connection?.status !== 'pending') throw new Error(`status ${view.connection?.status}`)
      ok('bank pending', 'bank reconcile')
      await json(await client(`/connections/${started.bank}/reconcile`, 'POST'), 202)
      ok('bank reconcile 202')
    }
    step = 'return 302'
    const back = await fetch(`${base}/c/return?nonce=bogusbogusbogusbogus`, { redirect: 'manual' })
    if (back.status !== 302) throw new Error(`status ${back.status}`)
    if (back.headers.get('location') !== '/c/return') throw new Error(`location ${back.headers.get('location')}`)
    ok('return 302', 'return csp')
    const page = await fetch(`${base}/c/return`)
    if (page.status !== 200) throw new Error(`status ${page.status}`)
    if (!(page.headers.get('content-type') ?? '').includes('text/html')) throw new Error('not html')
    const csp = page.headers.get('content-security-policy') ?? ''
    if (!csp.includes('cdn.truv.com') || !csp.includes('my.truv.com')) throw new Error('csp lacks the Truv hosts')
    ok('return csp', 'admin connections')
    const listed = await fetch(`${base}/api/admin/requests/${requestId}/connections`, { headers: staffHeaders })
    const { connections } = await json(listed, 200)
    const expected = Object.keys(started).length
    if (!Array.isArray(connections) || connections.length !== expected) {
      throw new Error(`${connections?.length} connections, expected ${expected}`)
    }
    ok(`admin connections ${connections.length}`)
    for (const conn of connections) {
      step = 'admin refresh'
      const res = await fetch(`${base}/api/admin/connections/${conn.id}/refresh`, { method: 'POST', headers: staffHeaders })
      if (![200, 502, 503].includes(res.status)) throw new Error(`status ${res.status}`)
      ok(`admin refresh ${conn.id} ${res.status}`)
    }
    return `keys: payroll ${configured.payroll ? 'yes' : 'no'}, bank ${configured.bank ? 'yes' : 'no'}`
  } catch (error) {
    console.log(`FAIL connect-flow ${step}: ${error instanceof Error ? error.message : String(error)}`)
    throw Object.assign(new Error('connect-flow failed'), { reported: true })
  }
}
