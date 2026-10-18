import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { insertConnection } from '../src/db/connections'
import { ProviderError } from '../src/integrations/provider-error'
import { reconcileConnection } from '../src/jobs/reconcile'
import { BUCKET, headBytes } from '../src/storage/case-documents'
import { fixtureText, seedConnectionFixture, type ConnectionFixture } from './fixtures/connections'
import { stubVendorFetch } from './helpers/vendor-fetch'

// PAY-02 live proof (test firm 00000000-0000-0000-0000-00000000000e): a two-employer Truv order ->
// stubbed income reports, link documents and PDFs -> Storage objects + documents rows per employer
// -> connection done -> idempotent rerun -> md5 mismatch refused. Only Truv is stubbed.
const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env
const live = Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY)
// eslint-disable-next-line no-console -- the skip reason must be visible in the run output
if (!live) console.warn('payroll fetch skipped: missing SUPABASE_URL or SUPABASE_SECRET_KEY')

// Distinct from the tracer's ord_fixture_1: live files run in parallel.
const ORDER_ID = 'ord_fixture_fetch'
const TINY = readFileSync(fileURLToPath(new URL('./fixtures/files/tiny.pdf', import.meta.url).href))

describe.skipIf(!live)('payroll fetch (live; needs SUPABASE_URL, SUPABASE_SECRET_KEY)', { timeout: 30_000 }, () => {
  const env = { ...process.env, TRUV_CLIENT_ID: 'test-client', TRUV_SECRET: 'test-secret', JOBS: { send: async () => {} } } as unknown as Env
  let fx: ConnectionFixture
  let connectionId = ''
  let vendor: ReturnType<typeof stubVendorFetch> | undefined
  let betaReport = fixtureText('truv/income_report_beta.json')

  const ok = (body: string) => () => new Response(body, { headers: { 'content-type': 'application/json' } })
  const docs = async () =>
    (await fx.admin.from('documents').select('*').eq('connection_id', connectionId).order('storage_key')).data! as Array<Record<string, any>> // eslint-disable-line @typescript-eslint/no-explicit-any
  const conn = async () => (await fx.admin.from('connections').select('*').eq('id', connectionId).single()).data!
  const callsTo = (re: RegExp) => vendor!.calls.filter((r) => re.test(r.url)).length

  beforeAll(async () => {
    fx = await seedConnectionFixture(env, { kind: 'payroll' })
    await fx.admin.from('connections').delete().eq('provider', 'truv').eq('external_id', ORDER_ID)
    connectionId = (
      await insertConnection(env, {
        firm_id: fx.firm_id,
        request_id: fx.request_id,
        request_item_id: fx.item_id,
        case_id: fx.case_id,
        provider: 'truv',
        kind: 'payroll',
        external_id: ORDER_ID,
      })
    ).id
    vendor = stubVendorFetch([
      { host: 'prod.truv.com', path: `/v1/orders/${ORDER_ID}/`, respond: ok(fixtureText('truv/order_two_employers.json')) },
      { host: 'prod.truv.com', path: '/v1/links/link_acme/income/report/', respond: ok(fixtureText('truv/income_report_acme.json')) },
      { host: 'prod.truv.com', path: '/v1/links/link_beta/income/report/', respond: () => ok(betaReport)() },
      { host: 'prod.truv.com', path: '/v1/links/link_acme/documents/', respond: ok(fixtureText('truv/documents_acme.json')) },
      { host: 'prod.truv.com', path: '/v1/links/link_beta/documents/', respond: ok(fixtureText('truv/documents_beta.json')) },
      { host: 'files.truv.test', path: /.*/, respond: () => new Response(TINY, { headers: { 'content-type': 'application/pdf' } }) },
    ])
  })

  afterAll(async () => {
    vendor?.restore()
    if (!fx) return
    const keys = connectionId ? (await docs()).map((d) => d.storage_key as string) : []
    if (keys.length) await fx.admin.storage.from(BUCKET).remove(keys)
    await fx.admin.from('documents').delete().eq('connection_id', connectionId)
    await fx.cleanup()
  })

  it('lands every file of both employers as ready documents and marks the connection done', async () => {
    const res = await reconcileConnection(env, connectionId, { source: 'cron' })
    expect(res.status).toBe('done')

    const rows = await docs()
    expect(rows).toHaveLength(6)
    const byType = (t: string) => rows.filter((d) => d.document_type === t).length
    expect([byType('income_report'), byType('pay_stub'), byType('w2'), byType('form_1099')]).toEqual([1, 3, 1, 1])
    for (const d of rows) {
      expect(d).toMatchObject({ status: 'ready', request_item_id: fx.item_id, uploaded_by_actor: 'provider:truv' })
      expect(await headBytes(env, d.storage_key)).not.toBeNull()
    }
    expect(rows.filter((d) => d.storage_key.includes('/payroll/acme-inc-emp_1/'))).toHaveLength(5)
    expect(rows.filter((d) => d.storage_key.includes('/payroll/beta-llc-emp_2/'))).toHaveLength(1)
    expect(rows.map((d) => d.original_filename)).toContain('Pay stub - September 15, 2026 - check 1001.pdf')

    const c = await conn()
    const employers = (c.data as { employers: Array<Record<string, unknown>> }).employers
    expect(employers[0]).toMatchObject({ company_name: 'Acme Inc', pay_stubs: 2, w2s: 1, income_reports: 1 })
    expect(employers[1]).toMatchObject({ company_name: 'Beta LLC', pay_stubs: 1, w2s: 0, income_reports: 0 })
    expect(employers.every((e) => typeof e.fetched_at === 'string')).toBe(true)
    expect(JSON.stringify(c.data)).not.toContain('https://files.truv.test')
    expect(JSON.stringify(c.data)).not.toContain('at_fixture_never_stored')

    const item = (await fx.admin.from('request_items').select('status').eq('id', fx.item_id).single()).data!
    expect(item.status).toBe('approved')
    const done = (await fx.admin.from('events').select('id').eq('request_id', fx.request_id).eq('action', 'connection.done')).data!
    expect(done).toHaveLength(1)
  })

  it('a rerun re-reads the order and downloads nothing', async () => {
    const before = vendor!.calls.length
    const res = await reconcileConnection(env, connectionId, { source: 'cron' })
    expect(res.status).toBe('done')
    expect(await docs()).toHaveLength(6)
    expect(vendor!.calls.slice(before).map((r) => new URL(r.url).pathname)).toEqual([`/v1/orders/${ORDER_ID}/`])
  })

  it('a file whose md5sum does not match is refused (file_hash_mismatch) and never stored', async () => {
    const report = JSON.parse(betaReport)
    report.employments[0].statements.push({ pay_date: '2026-10-15', check_number: '78', file: 'https://files.truv.test/beta/bad.pdf', md5sum: '0'.repeat(32) })
    betaReport = JSON.stringify(report)
    const c = await conn()
    const employers = (c.data as { employers: Array<Record<string, unknown>> }).employers.map((e) =>
      e.employer_id === 'emp_2' ? { ...e, fetched_at: undefined } : e
    )
    await fx.admin.from('connections').update({ data: { ...c.data, employers } }).eq('id', connectionId)
    const downloadsBefore = callsTo(/files\.truv\.test/)

    const err = await reconcileConnection(env, connectionId, { source: 'cron' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ProviderError)
    expect((err as ProviderError).code).toBe('file_hash_mismatch')
    // the stored Beta stub was skipped before download; only the bad file was fetched
    expect(callsTo(/files\.truv\.test/) - downloadsBefore).toBe(1)
    const rows = await docs()
    expect(rows).toHaveLength(6)
    expect(rows.map((d) => d.original_filename)).not.toContain('Pay stub - October 15, 2026 - check 78.pdf')
  })
})
