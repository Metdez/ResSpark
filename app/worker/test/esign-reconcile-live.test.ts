import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createAdminClient } from '../src/db/client'
import { insertConnection } from '../src/db/connections'
import { listStaleConnections } from '../src/db/connections-ops'
import { approveItem } from '../src/db/review'
import { _setDefaultFirmIdForTests } from '../src/db/webhook-events'
import { app } from '../src/index'
import { ProviderError } from '../src/integrations/provider-error'
import { queue, type Job } from '../src/jobs/index'
import { handleLogicsPushPart, type LogicsPushJob } from '../src/jobs/logics-push'
import { reconcileConnection } from '../src/jobs/reconcile'
import { fixtureText } from './fixtures/connections'
import { TEST_STAFF_UUID } from './fixtures/logics-push'
import { seedPortalItems, type PortalFixture } from './fixtures/portal-items'
import { TEST_FIRM_ID } from './fixtures/request'
import { signDocuseal } from './helpers/docuseal-sign'
import { stubVendorFetch } from './helpers/vendor-fetch'

// SIGN-02 / D-18 / D-19 matrix against the live project (test firm only), DocuSeal stubbed, Logics
// in fake mode. Each case owns its request and a submission id (42xx) no other suite uses.
vi.mock('../src/middleware/staff-auth', async () => {
  const { createMiddleware } = await import('hono/factory')
  return {
    staffAuth: createMiddleware(async (c, next) => {
      c.set('staff', { userId: '00000000-0000-0000-0000-0000000000a5', firmId: '00000000-0000-0000-0000-00000000000e', role: 'admin', displayName: 'Test agent' })
      await next()
    }),
  }
})

const { SUPABASE_URL, SUPABASE_SECRET_KEY, CLIENT_LINK_HMAC_KEY } = process.env
const live = Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY && CLIENT_LINK_HMAC_KEY)
// eslint-disable-next-line no-console -- the skip reason must be visible in the run output
if (!live) console.warn('esign reconcile matrix skipped: missing SUPABASE_URL, SUPABASE_SECRET_KEY or CLIENT_LINK_HMAC_KEY')

const TINY = readFileSync(fileURLToPath(new URL('./fixtures/files/tiny.pdf', import.meta.url).href))
const SUBS = { done: 4201, notReady: 4202, declined: 4203, viewed: 4204, cron: 4205 } as const
const UNMATCHED = 9999
const VIEWED_KEY = `form.viewed:5204:2026-10-11T11:55:00Z`
const UNMATCHED_KEY = `form.completed:5999:2026-10-11T12:00:00Z`

const withId = (rel: string, id: number) => {
  const sub = JSON.parse(fixtureText(rel))
  sub.id = id
  sub.submitters[0].id = id + 1000
  return () => Response.json(sub)
}

describe.skipIf(!live)('esign reconcile matrix (live; needs SUPABASE_URL, SUPABASE_SECRET_KEY, CLIENT_LINK_HMAC_KEY)', () => {
  const sent: Array<Job | LogicsPushJob> = []
  const secret = 'whsec_test_' + randomUUID()
  const env = {
    ...process.env,
    DOCUSEAL_API_KEY: 'test-key',
    DOCUSEAL_API_URL: 'https://api.docuseal.com',
    DOCUSEAL_ENV: 'test',
    DOCUSEAL_WEBHOOK_SECRET: secret,
    APP_ENV: 'sandbox',
    LOGICS_MODE: 'fake',
    LOGICS_WRITE_ENABLED: 'true',
    LOGICS_TEST_CASE_IDS: '900002',
    JOBS: { send: async (job: Job | LogicsPushJob) => void sent.push(job) },
  } as unknown as Env
  const admin = live ? createAdminClient(env) : (undefined as unknown as ReturnType<typeof createAdminClient>)
  const fixtures: PortalFixture[] = []
  const conns: Partial<Record<keyof typeof SUBS, { id: string; item: string; requestId: string }>> = {}
  let vendor: ReturnType<typeof stubVendorFetch> | undefined
  let restoreFirm = async () => {}

  const submissionCalls = (id: number) => vendor!.calls.filter((r) => new URL(r.url).pathname === `/submissions/${id}`)
  const statusOf = async (id: string) => (await admin.from('connections').select('status, error').eq('id', id).single()).data!
  const itemStatus = async (id: string) => (await admin.from('request_items').select('status').eq('id', id).single()).data!.status
  const events = async (requestId: string, action: string) =>
    (await admin.from('events').select('payload').eq('request_id', requestId).eq('action', action)).data!
  const clearLedger = () => admin.from('webhook_events').delete().eq('provider', 'docuseal').in('event_key', [VIEWED_KEY, UNMATCHED_KEY])
  const deliver = async (job: Job) => {
    const ack = vi.fn()
    const retry = vi.fn()
    await queue({ queue: 'resspark-jobs', messages: [{ body: job, attempts: 1, ack, retry }] } as unknown as MessageBatch<Job>, env)
    return { ack, retry }
  }
  const postSigned = async (rel: string, data: Record<string, unknown>) => {
    const fixture = JSON.parse(fixtureText(rel))
    const raw = JSON.stringify({ ...fixture, data: { ...fixture.data, ...data } })
    return app.request(
      '/api/webhooks/docuseal',
      { method: 'POST', body: raw, headers: { 'content-type': 'application/json', 'x-docuseal-signature': await signDocuseal(raw, secret) } },
      env
    )
  }

  beforeAll(async () => {
    _setDefaultFirmIdForTests(TEST_FIRM_ID)
    await clearLedger()
    await admin.from('connections').delete().eq('provider', 'docuseal').in('external_id', [...Object.values(SUBS), UNMATCHED].map(String))
    for (const key of Object.keys(SUBS) as Array<keyof typeof SUBS>) {
      const fx = await seedPortalItems(env, { kinds: ['signature'], logicsCaseId: 900002 })
      fixtures.push(fx)
      const conn = await insertConnection(env, {
        firm_id: fx.firmId,
        request_id: fx.requestId,
        request_item_id: fx.items.signature!,
        case_id: fx.caseId,
        provider: 'docuseal',
        kind: 'signature',
        external_id: String(SUBS[key]),
        data: { template_key: 'engagement_letter', template_id: 1001, submitter_id: SUBS[key] + 1000, env: 'test' },
      })
      conns[key] = { id: conn.id, item: fx.items.signature!, requestId: fx.requestId }
    }
    const pdf = () => new Response(TINY, { headers: { 'content-type': 'application/pdf' } })
    vendor = stubVendorFetch([
      { host: 'api.docuseal.com', path: `/submissions/${SUBS.done}`, respond: withId('docuseal/submission_completed.json', SUBS.done) },
      { host: 'api.docuseal.com', path: `/submissions/${SUBS.notReady}`, respond: withId('docuseal/submission_completed_no_docs.json', SUBS.notReady) },
      { host: 'api.docuseal.com', path: `/submissions/${SUBS.declined}`, respond: withId('docuseal/submission_declined.json', SUBS.declined) },
      { host: 'api.docuseal.com', path: `/submissions/${SUBS.viewed}`, respond: withId('docuseal/submission_completed.json', SUBS.viewed) },
      { host: 'docuseal.com', path: /^\/file\/.+\.pdf$/, respond: pdf },
    ])
  })

  afterAll(async () => {
    vendor?.restore()
    _setDefaultFirmIdForTests(null)
    await restoreFirm()
    await clearLedger()
    for (const fx of fixtures) {
      await admin.from('logics_pushes').delete().eq('request_id', fx.requestId)
      await admin.from('logics_push_batches').delete().eq('request_id', fx.requestId)
      await fx.cleanup()
    }
  })

  it('rerun: a done signature makes no DocuSeal call and creates no rows', async () => {
    const c = conns.done!
    expect((await reconcileConnection(env, c.id, { source: 'client' })).status).toBe('done')
    expect(submissionCalls(SUBS.done)).toHaveLength(1)
    const res = await reconcileConnection(env, c.id, { source: 'staff' })
    expect(res).toEqual({ status: 'done', applied: false })
    expect(submissionCalls(SUBS.done)).toHaveLength(1)
    expect((await admin.from('documents').select('id').eq('request_item_id', c.item)).data).toHaveLength(2)
  })

  it('not ready: a completed submission without documents throws a transient artifacts_not_ready and the queue retries', async () => {
    const c = conns.notReady!
    const err = await reconcileConnection(env, c.id, { source: 'staff' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ProviderError)
    expect(err).toMatchObject({ code: 'artifacts_not_ready', transient: true })
    expect((await statusOf(c.id)).status).toBe('pending')
    const { ack, retry } = await deliver({ type: 'reconcile', ref: c.id })
    expect(ack).not.toHaveBeenCalled()
    expect(retry).toHaveBeenCalledWith({ delaySeconds: expect.any(Number) })
  })

  it("declined: the connection errors with code 'declined' and the item is not submitted", async () => {
    const c = conns.declined!
    await reconcileConnection(env, c.id, { source: 'staff' })
    const row = await statusOf(c.id)
    expect(row.status).toBe('error')
    expect((row.error as { code: string }).code).toBe('declined')
    expect(await itemStatus(c.item)).not.toBe('submitted')
    expect(await events(c.requestId, 'connection.error')).toHaveLength(1)
  })

  it('viewed: a signed form.viewed logs esign.viewed only, with no status change and no DocuSeal call', async () => {
    const c = conns.viewed!
    const res = await postSigned('docuseal/webhook_form_viewed.json', { id: SUBS.viewed + 1000, submission_id: SUBS.viewed })
    expect(res.status).toBe(200)
    const job = sent.find((j): j is Job => j.type === 'webhook')!
    const { ack } = await deliver(job)
    expect(ack).toHaveBeenCalledTimes(1)
    const viewed = await events(c.requestId, 'esign.viewed')
    expect(viewed).toHaveLength(1)
    expect((viewed[0].payload as { connection_id: string }).connection_id).toBe(c.id)
    expect((await statusOf(c.id)).status).toBe('pending')
    expect(submissionCalls(SUBS.viewed)).toHaveLength(0)
  })

  it('unmatched: a form.completed for an unknown submission ends ignored', async () => {
    const before = sent.length
    const res = await postSigned('docuseal/webhook_form_completed.json', { id: 5999, submission_id: UNMATCHED })
    expect(res.status).toBe(200)
    const { ack } = await deliver(sent[before] as Job)
    expect(ack).toHaveBeenCalledTimes(1)
    const row = (await admin.from('webhook_events').select('status').eq('provider', 'docuseal').eq('event_key', UNMATCHED_KEY).single()).data!
    expect(row.status).toBe('ignored')
    expect(submissionCalls(UNMATCHED)).toHaveLength(0)
  })

  it('cron pickup: a pending signature last polled 20 minutes ago is in the stale sweep', async () => {
    const c = conns.cron!
    const old = new Date(Date.now() - 20 * 60_000).toISOString()
    await admin.from('connections').update({ created_at: old, last_polled_at: old }).eq('id', c.id)
    // shortcut: limit 1000, not the cron's 50, so leftover stale rows elsewhere in the test project cannot crowd it out
    expect(await listStaleConnections(env, 10, 1000)).toContain(c.id)
  })

  it('push: after approval the signed PDF goes to Logics in fake mode and its row reaches sent', async () => {
    const c = conns.done!
    restoreFirm = await enableFirmWrites()
    await approveItem(env, TEST_FIRM_ID, c.item, TEST_STAFF_UUID)
    const doc = (await admin.from('documents').select('id').eq('request_item_id', c.item).eq('document_type', 'signed_document').single()).data!
    const res = await app.request(
      `/api/admin/requests/${c.requestId}/logics-push`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ document_ids: [doc.id] }) },
      env
    )
    expect(res.status).toBe(202)
    const body = (await res.json()) as { push_ids: string[]; mode: string }
    expect(body.mode).toBe('fake')
    const job = sent.find((j): j is LogicsPushJob => j.type === 'logics_push')!
    const msg = { body: job, ack: vi.fn(), retry: vi.fn(), attempts: 1, id: 'm1', timestamp: new Date() } as unknown as Message<LogicsPushJob>
    await handleLogicsPushPart(msg, env)
    const row = (await admin.from('logics_pushes').select('id, state, logics_document_id').eq('id', body.push_ids[0]).single()).data!
    expect(row.state).toBe('sent')
    expect(Number.isInteger(Number(row.logics_document_id))).toBe(true)
    // eslint-disable-next-line no-console -- the push row is recorded in the plan summary
    console.info(`signed PDF push row ${row.id}, fake CaseDocumentID ${row.logics_document_id}`)
  })

  // D-08: the push also needs the firm's own write toggle; on for the test firm only, then restored.
  async function enableFirmWrites(): Promise<() => Promise<void>> {
    const before = (await admin.from('firm_integrations').select('settings').eq('firm_id', TEST_FIRM_ID).eq('provider', 'logics').maybeSingle()).data
    const write = (settings: Record<string, unknown>) =>
      admin.from('firm_integrations').upsert({ firm_id: TEST_FIRM_ID, provider: 'logics', settings }, { onConflict: 'firm_id,provider' })
    const { error } = await write({ ...before?.settings, write_enabled: true })
    if (error) throw new Error(`enable firm writes: ${error.message}`)
    return async () => {
      if (before) await write(before.settings)
      else await admin.from('firm_integrations').delete().eq('firm_id', TEST_FIRM_ID).eq('provider', 'logics')
    }
  }
})
