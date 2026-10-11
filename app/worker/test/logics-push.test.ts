import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createAdminClient } from '../src/db/client'
import { fingerprintHex } from '../src/db/logics-pushes'
import { app } from '../src/index'
import { createFakeLogicsClient } from '../src/integrations/logics/fixtures'
import { handleLogicsPushPart, type LogicsPushJob } from '../src/jobs/logics-push'
import { makeMultiPagePdf } from '../src/pdf/test-fixtures'
import { BUCKET } from '../src/storage/case-documents'
import { seedPushRequest, TEST_STAFF_UUID, type PushFixture } from './fixtures/logics-push'
import { TEST_FIRM_ID } from './fixtures/request'

// PUSH-01/03 tracer against the live project in fake mode: route -> RPC -> queue message ->
// handler -> FakeLogicsClient -> ledger -> activity note. Nothing reaches a Logics host.
// Run with `pnpm -C app run test:live:file worker/test/logics-push.test.ts`.
vi.mock('../src/middleware/staff-auth', async () => {
  const { createMiddleware } = await import('hono/factory')
  return {
    staffAuth: createMiddleware(async (c, next) => {
      c.set('staff', { userId: TEST_STAFF_UUID, firmId: TEST_FIRM_ID, role: 'admin', displayName: 'Test agent' })
      await next()
    }),
  }
})

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env

// D-08: the push route also needs the firm's own write toggle; on for the test firm only, then restored.
async function enableFirmWrites(db: SupabaseClient): Promise<() => Promise<void>> {
  const before = (await db.from('firm_integrations').select('settings').eq('firm_id', TEST_FIRM_ID).eq('provider', 'logics').maybeSingle()).data
  const write = (settings: Record<string, unknown>) =>
    db.from('firm_integrations').upsert({ firm_id: TEST_FIRM_ID, provider: 'logics', settings }, { onConflict: 'firm_id,provider' })
  const { error } = await write({ ...before?.settings, write_enabled: true })
  if (error) throw new Error(`enable firm writes: ${error.message}`)
  return async () => {
    if (before) await write(before.settings)
    else await db.from('firm_integrations').delete().eq('firm_id', TEST_FIRM_ID).eq('provider', 'logics')
  }
}
const PDF = readFileSync(
  fileURLToPath(new URL('../../../examples/01_marcus_delgado_CNC/01_IRS_Account_Transcript.pdf', import.meta.url).href)
)

describe.skipIf(!SUPABASE_URL || !SUPABASE_SECRET_KEY)('logics push tracer (live, fake mode; needs SUPABASE_URL, SUPABASE_SECRET_KEY)', () => {
  const sent: LogicsPushJob[] = []
  const env = {
    SUPABASE_URL,
    SUPABASE_SECRET_KEY,
    APP_ENV: 'sandbox',
    LOGICS_MODE: 'fake',
    LOGICS_WRITE_ENABLED: 'true',
    LOGICS_TEST_CASE_IDS: '900001',
    JOBS: { send: async (m: LogicsPushJob) => void sent.push(m) },
  } as unknown as Env
  let db: SupabaseClient
  let fx: PushFixture
  let restore = async () => {}
  let pushId = ''

  const push = (body: unknown, over: Partial<Record<string, string>> = {}) =>
    app.request(
      `/api/admin/requests/${fx.request_id}/logics-push`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
      { ...env, ...over }
    )
  const errorOf = async (res: Response) => ((await res.json()) as { error: { code: string; message: string } }).error
  const row = async (id: string) => (await db.from('logics_pushes').select('*').eq('id', id).single()).data!
  const events = async (action: string) =>
    (await db.from('events').select('id, payload').eq('request_id', fx.request_id).eq('action', action)).data!
  const message = (body: LogicsPushJob) =>
    ({ body, ack: vi.fn(), retry: vi.fn(), attempts: 1, id: 'm1', timestamp: new Date() }) as unknown as Message<LogicsPushJob> & {
      ack: ReturnType<typeof vi.fn>
      retry: ReturnType<typeof vi.fn>
    }

  beforeAll(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    db = createAdminClient(env)
    restore = await enableFirmWrites(db)
    fx = await seedPushRequest(db, { logicsCaseId: 900001, docs: [{ name: 'transcript.pdf', bytes: new Uint8Array(PDF) }] })
  })

  afterAll(async () => {
    if (fx) await fx.cleanup()
    await restore()
  })

  it('refuses with the firm message when the firm toggle is off', async () => {
    await restore()
    const res = await push({ document_ids: fx.document_ids })
    expect(res.status).toBe(403)
    expect((await errorOf(res)).message).toBe('Logics writes are turned off for this firm in Settings')
    restore = await enableFirmWrites(db)
    expect(sent).toHaveLength(0)
  })

  it('refuses before anything is enqueued when writes are off or the case is not allowlisted', async () => {
    const off = await push({ document_ids: fx.document_ids }, { LOGICS_WRITE_ENABLED: 'false' })
    expect(off.status).toBe(403)
    expect((await errorOf(off)).message).toBe('Logics writes are disabled in this environment')
    const unlisted = await push({ document_ids: fx.document_ids }, { LOGICS_TEST_CASE_IDS: '1' })
    expect(unlisted.status).toBe(403)
    expect((await errorOf(unlisted)).message).toContain('is not on the test allowlist')
    expect(sent).toHaveLength(0)
  })

  it('refuses an empty selection with no_items', async () => {
    const res = await push({ document_ids: [] })
    expect(res.status).toBe(400)
    expect((await errorOf(res)).code).toBe('no_items')
  })

  it('creates one batch, one queued fake-mode row and one queue message', async () => {
    const res = await push({ document_ids: fx.document_ids })
    expect(res.status).toBe(202)
    const body = (await res.json()) as { batch_id: string; push_ids: string[]; mode: string }
    expect(body.batch_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(body.push_ids).toHaveLength(1)
    expect(body.mode).toBe('fake')
    pushId = body.push_ids[0]
    const r = await row(pushId)
    expect(r).toMatchObject({ state: 'queued', mode: 'fake', part_index: 0, attempts: 0 })
    const doc = (await db.from('documents').select('sha256').eq('id', fx.document_ids[0]).single()).data!
    expect(r.request_fingerprint).toBe(await fingerprintHex(fx.case_id, doc.sha256, 0))
    expect(await events('logics.push_queued')).toHaveLength(1)
    expect(sent).toEqual([{ type: 'logics_push', provider: 'logics', ref: pushId }])
  })

  it('refuses the same document again with already_pushed', async () => {
    const res = await push({ document_ids: fx.document_ids })
    expect(res.status).toBe(409)
    expect((await errorOf(res)).code).toBe('already_pushed')
    expect(sent).toHaveLength(1)
  })

  it('the handler claims, sends through the fake client, acks once and writes one activity note', async () => {
    const msg = message(sent[0])
    await handleLogicsPushPart(msg, env)
    expect(msg.ack).toHaveBeenCalledTimes(1)
    expect(msg.retry).not.toHaveBeenCalled()
    const r = await row(pushId)
    expect(r.state).toBe('sent')
    expect(Number.isInteger(Number(r.logics_document_id))).toBe(true)
    expect(Number(r.logics_document_id)).toBeGreaterThan(0)
    expect(r.attempts).toBe(1)
    expect(r.sent_at).toBeTruthy()
    expect(r.claimed_at).toBeTruthy()
    const batch = (await db.from('logics_push_batches').select('*').eq('id', r.batch_id).single()).data!
    expect(batch.activity_state).toBe('sent')
    expect(Number.isInteger(Number(batch.logics_activity_id))).toBe(true)
    for (const action of ['logics.push_sending', 'logics.push_sent', 'logics.activity_sent']) {
      expect(await events(action)).toHaveLength(1)
    }
    process.stdout.write(`fake CaseDocumentID ${r.logics_document_id}, ActivityID ${batch.logics_activity_id}\n`)
  })

  it('GET logics-pushes returns the batch with the sent row in fake mode', async () => {
    const res = await app.request(`/api/admin/requests/${fx.request_id}/logics-pushes`, {}, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { mode: string; batches: Array<{ activity_state: string; pushes: Array<{ state: string; mode: string }> }> }
    expect(body.mode).toBe('fake')
    expect(body.batches).toHaveLength(1)
    expect(body.batches[0].activity_state).toBe('sent')
    expect(body.batches[0].pushes).toMatchObject([{ state: 'sent', mode: 'fake' }])
  })

  it('a redelivered message for a sent row is acked, never retried, and changes nothing', async () => {
    const msg = message(sent[0])
    await handleLogicsPushPart(msg, env)
    expect(msg.ack).toHaveBeenCalledTimes(1)
    expect(msg.retry).not.toHaveBeenCalled()
    expect((await row(pushId)).attempts).toBe(1)
    expect(await events('logics.push_sending')).toHaveLength(1)
  })
})

// PUSH-02 live: a ~720 KB 12-page PDF split at a 200,000-byte test target into stored parts,
// sibling rows and messages, every part sent through the fake client, one activity note.
describe.skipIf(!SUPABASE_URL || !SUPABASE_SECRET_KEY)('logics push multipart (live, fake mode)', () => {
  const sent: LogicsPushJob[] = []
  const env = {
    SUPABASE_URL,
    SUPABASE_SECRET_KEY,
    APP_ENV: 'sandbox',
    LOGICS_MODE: 'fake',
    LOGICS_WRITE_ENABLED: 'true',
    LOGICS_TEST_CASE_IDS: '900001',
    JOBS: { send: async (m: LogicsPushJob) => void sent.push(m) },
  } as unknown as Env
  const fake = createFakeLogicsClient({ delayMs: 0 })
  const createActivity = vi.spyOn(fake, 'createActivity')
  const opts = { targetBytes: 200_000, clientFactory: () => fake }
  let db: SupabaseClient
  let fx: PushFixture
  let restore = async () => {}
  let prefix = ''

  beforeAll(async () => {
    db = createAdminClient(env)
    restore = await enableFirmWrites(db)
    fx = await seedPushRequest(db, { logicsCaseId: 900001, docs: [{ name: 'statement.pdf', bytes: await makeMultiPagePdf(12, 60_000) }] })
    prefix = `firm/${TEST_FIRM_ID}/case/${fx.case_id}/logics/${fx.document_ids[0]}`
  })

  afterAll(async () => {
    if (!fx) return
    const { data } = await db.storage.from(BUCKET).list(prefix)
    if (data?.length) await db.storage.from(BUCKET).remove(data.map((o) => `${prefix}/${o.name}`))
    await fx.cleanup()
    await restore()
  })

  it('normalizes into stored, hashed parts and sends every part once', async () => {
    const res = await app.request(
      `/api/admin/requests/${fx.request_id}/logics-push`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ document_ids: fx.document_ids }) },
      env
    )
    expect(res.status).toBe(202)
    const start = Date.now()
    for (let i = 0; i < sent.length; i++) {
      const msg = { body: sent[i], ack: vi.fn(), retry: vi.fn(), attempts: 1 } as unknown as Message<LogicsPushJob>
      await handleLogicsPushPart(msg, env, opts)
      expect(msg.ack).toHaveBeenCalledTimes(1)
      expect(msg.retry).not.toHaveBeenCalled()
    }
    const wall = Date.now() - start

    const rows = (await db.from('logics_pushes').select('*').eq('document_id', fx.document_ids[0]).order('part_index')).data!
    const n = rows.length
    expect(n).toBeGreaterThanOrEqual(3)
    expect(sent).toHaveLength(n)
    for (const [k, r] of rows.entries()) {
      expect(r).toMatchObject({ state: 'sent', part_index: k, part_count: n, part_storage_path: `${prefix}/part-${k}.pdf` })
      expect(r.part_bytes).toBeLessThanOrEqual(200_000)
    }
    expect(new Set(rows.map((r) => r.part_sha256)).size).toBe(n)
    expect(rows.every((r) => r.part_storage_path.includes('/logics/'))).toBe(true)

    const { data: objects } = await db.storage.from(BUCKET).list(prefix)
    expect(objects?.map((o) => o.name).sort()).toEqual(rows.map((_, k) => `part-${k}.pdf`).sort())

    expect(createActivity).toHaveBeenCalledTimes(1)
    const comment = createActivity.mock.calls[0][0].comment
    for (let k = 1; k <= n; k++) expect(comment).toContain(`(part ${k} of ${n})`)
    expect(comment).toContain('(part 1 of ')
    process.stdout.write(`multipart: ${n} parts, bytes ${rows.map((r) => r.part_bytes).join('/')}, consumer wall ${wall} ms
`)
  }, 60_000)
})
