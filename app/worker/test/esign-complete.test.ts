import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createAdminClient } from '../src/db/client'
import { insertConnection } from '../src/db/connections'
import { _setDefaultFirmIdForTests } from '../src/db/webhook-events'
import { app } from '../src/index'
import { queue, type Job } from '../src/jobs/index'
import { BUCKET } from '../src/storage/case-documents'
import { fixtureText } from './fixtures/connections'
import { seedPortalItems, type PortalFixture } from './fixtures/portal-items'
import { TEST_FIRM_ID } from './fixtures/request'
import { signDocuseal } from './helpers/docuseal-sign'
import { stubVendorFetch } from './helpers/vendor-fetch'

// SIGN-02 / WEBH-01 tracer against the live project (test firm only), DocuSeal stubbed:
// signed form.completed -> 200 + ledger + enqueue -> queue() -> GET /submissions/{id} -> two
// downloads -> two documents with sha256 -> connection done -> item approved -> request complete (0011).
// Ids 4101/5101 (not the fixture's 4001/5001): esign-start.test.ts owns docuseal external_id 4001
// while it runs, and (provider, external_id) is unique.
const { SUPABASE_URL, SUPABASE_SECRET_KEY, CLIENT_LINK_HMAC_KEY } = process.env
const live = Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY && CLIENT_LINK_HMAC_KEY)
// eslint-disable-next-line no-console -- the skip reason must be visible in the run output
if (!live) console.warn('esign complete skipped: missing SUPABASE_URL, SUPABASE_SECRET_KEY or CLIENT_LINK_HMAC_KEY')

const SUB = 4101
const SUBMITTER = 5101
const EVENT_KEY = `form.completed:${SUBMITTER}:2026-10-11T12:00:00Z`
const REJECTED_KEY = `form.completed:${SUBMITTER}:2026-10-11T12:00:01Z`
const TINY = readFileSync(fileURLToPath(new URL('./fixtures/files/tiny.pdf', import.meta.url).href))
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

describe.skipIf(!live)('esign complete (live; needs SUPABASE_URL, SUPABASE_SECRET_KEY, CLIENT_LINK_HMAC_KEY)', () => {
  const sent: Job[] = []
  const secret = 'whsec_test_' + randomUUID()
  const env = {
    ...process.env,
    DOCUSEAL_API_KEY: 'test-key',
    DOCUSEAL_API_URL: 'https://api.docuseal.com',
    DOCUSEAL_ENV: 'test',
    DOCUSEAL_WEBHOOK_SECRET: secret,
    JOBS: { send: async (job: Job) => void sent.push(job) },
  } as unknown as Env
  const admin = live ? createAdminClient(env) : (undefined as unknown as ReturnType<typeof createAdminClient>)
  let fx: PortalFixture
  let item = ''
  let connectionId = ''
  let vendor: ReturnType<typeof stubVendorFetch> | undefined
  const fixture = JSON.parse(fixtureText('docuseal/webhook_form_completed.json'))
  const raw = JSON.stringify({ ...fixture, data: { ...fixture.data, id: SUBMITTER, submission_id: SUB, external_id: 'set-in-beforeAll' } })
  const submission = JSON.parse(fixtureText('docuseal/submission_completed.json'))
  submission.id = SUB
  submission.submitters[0].id = SUBMITTER

  const post = async (body: string, signature: string) =>
    app.request(
      '/api/webhooks/docuseal',
      { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-docuseal-signature': signature } },
      env
    )
  const ledger = async (key: string) => (await admin.from('webhook_events').select('*').eq('provider', 'docuseal').eq('event_key', key)).data!
  const clearLedger = () => admin.from('webhook_events').delete().eq('provider', 'docuseal').in('event_key', [EVENT_KEY, REJECTED_KEY])

  beforeAll(async () => {
    _setDefaultFirmIdForTests(TEST_FIRM_ID)
    fx = await seedPortalItems(env, { kinds: ['signature'] })
    item = fx.items.signature!
    // leftovers of a crashed run would turn the first delivery into a duplicate / violate the unique external id
    await clearLedger()
    await admin.from('connections').delete().eq('provider', 'docuseal').eq('external_id', String(SUB))
    const conn = await insertConnection(env, {
      firm_id: fx.firmId,
      request_id: fx.requestId,
      request_item_id: item,
      case_id: fx.caseId,
      provider: 'docuseal',
      kind: 'signature',
      external_id: String(SUB),
      link_ref: 'fixtureSlugComplete',
      data: { template_key: 'engagement_letter', template_id: 1001, submitter_id: SUBMITTER, env: 'test', expire_at: new Date(Date.now() + 14 * 86_400_000).toISOString() },
    })
    connectionId = conn.id
    const pdf = () => new Response(TINY, { headers: { 'content-type': 'application/pdf' } })
    vendor = stubVendorFetch([
      { host: 'api.docuseal.com', path: `/submissions/${SUB}`, method: 'GET', respond: () => Response.json(submission) },
      { host: 'docuseal.com', path: '/file/signed-fixture.pdf', respond: pdf },
      { host: 'docuseal.com', path: '/file/audit-fixture.pdf', respond: pdf },
    ])
  })

  afterAll(async () => {
    vendor?.restore()
    _setDefaultFirmIdForTests(null)
    if (!fx) return
    await clearLedger()
    await fx.cleanup()
  })

  it('verifies the raw bytes, records one ledger row, enqueues an id and answers 200 in under a second', async () => {
    const t0 = Date.now()
    const res = await post(raw, await signDocuseal(raw, secret))
    const elapsed = Date.now() - t0
    // eslint-disable-next-line no-console -- the measured latency is recorded in the plan summary
    console.info(`first POST /api/webhooks/docuseal: ${elapsed} ms`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(elapsed).toBeLessThan(1000)
    expect(sent).toEqual([{ type: 'webhook', provider: 'docuseal', ref: expect.stringMatching(UUID) }])
    const rows = await ledger(EVENT_KEY)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ provider: 'docuseal', status: 'queued' })
    expect(vendor!.calls).toHaveLength(0)
  })

  it('answers a redelivery of the same bytes with duplicate: true and enqueues nothing', async () => {
    const res = await post(raw, await signDocuseal(raw, secret))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, duplicate: true })
    expect(sent).toHaveLength(1)
  })

  it('consumer re-reads the submission, stores both PDFs with sha256 and moves connection, item and request forward', async () => {
    const ack = vi.fn()
    const retry = vi.fn()
    await queue({ queue: 'resspark-jobs', messages: [{ body: sent[0], attempts: 1, ack, retry }] } as unknown as MessageBatch<Job>, env)
    expect(ack).toHaveBeenCalledTimes(1)
    expect(retry).not.toHaveBeenCalled()

    const api = vendor!.calls.filter((r) => new URL(r.url).host === 'api.docuseal.com')
    expect(api.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([`GET /submissions/${SUB}`])
    expect(api[0].headers.get('x-auth-token')).toBe('test-key')
    const files = vendor!.calls.filter((r) => new URL(r.url).host === 'docuseal.com')
    expect(files).toHaveLength(2)
    for (const f of files) expect(f.headers.get('x-auth-token')).toBeNull()

    const sha = createHash('sha256').update(TINY).digest('hex')
    const docs = (await admin.from('documents').select('*').eq('request_item_id', item).order('document_type')).data!
    expect(docs.map((d) => d.document_type)).toEqual(['esign_audit_log', 'signed_document'])
    const prefix = `firm/${fx.firmId}/case/${fx.caseId}/item/${item}/signature/${SUB}/`
    for (const d of docs) {
      expect(d).toMatchObject({ sha256: sha, status: 'ready', uploaded_by_actor: 'provider:docuseal', connection_id: connectionId })
      expect(d.storage_key.startsWith(prefix)).toBe(true)
      const blob = (await admin.storage.from(BUCKET).download(d.storage_key)).data!
      expect((await blob.text()).startsWith('%PDF-')).toBe(true)
    }
    // eslint-disable-next-line no-console -- the storage names are recorded in the plan summary
    console.info(`signature storage names: ${docs.map((d) => d.storage_key.slice(prefix.length)).join(', ')}`)

    const conn = (await admin.from('connections').select('*').eq('id', connectionId).single()).data!
    expect(conn.status).toBe('done')
    expect(conn.completed_at).toBeTruthy()
    expect((await admin.from('request_items').select('status').eq('id', item).single()).data!.status).toBe('approved')
    expect((await admin.from('requests').select('status').eq('id', fx.requestId).single()).data!.status).toBe('complete')
    const events = (await admin.from('events').select('action, payload').eq('request_id', fx.requestId)).data!
    expect(events.filter((e) => e.action === 'connection.done')).toHaveLength(1)
    const [row] = await ledger(EVENT_KEY)
    expect(row.status).toBe('done')

    // T-06-17: document URLs live only inside the job
    const persisted = JSON.stringify([docs, conn.data, events.map((e) => e.payload)])
    expect(persisted).not.toContain('docuseal.com/file/')
  })

  it('rejects a body signed with another secret: 401 invalid_signature and no ledger row', async () => {
    const other = JSON.stringify({ ...JSON.parse(raw), timestamp: '2026-10-11T12:00:01Z' })
    const res = await post(other, await signDocuseal(other, 'whsec_other'))
    expect(res.status).toBe(401)
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('invalid_signature')
    expect(await ledger(REJECTED_KEY)).toHaveLength(0)
    expect(sent).toHaveLength(1)
  })
})
