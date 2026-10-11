import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createAdminClient } from '../src/db/client'
import { app } from '../src/index'
import { BUCKET, headBytes } from '../src/storage/case-documents'
import { seedFinancialCase, TEST_FIRM, type FinancialFixture } from './fixtures/financials'

// FORM-06 tracer against the live project: evaluate -> export the run as a worksheet PDF ->
// stored object + one documents row + worksheet.generated; a re-export returns the same document.
// Run with `pnpm -C app run test:live:file worker/test/worksheet.test.ts`.
const STAFF_ID = '00000000-0000-0000-0000-0000000000a7'
vi.mock('../src/middleware/staff-auth', async () => {
  const { createMiddleware } = await import('hono/factory')
  return {
    staffAuth: createMiddleware(async (c, next) => {
      c.set('staff', { userId: STAFF_ID, firmId: TEST_FIRM, role: 'admin', displayName: 'Test agent' })
      await next()
    }),
  }
})

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env
const live = Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY)
if (!live) process.stderr.write('worksheet suite skipped: missing SUPABASE_URL or SUPABASE_SECRET_KEY\n')

const golden = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/engine/golden.json', import.meta.url).href), 'utf8')) as {
  cases: Array<{ name: string; row: Record<string, unknown> }>
}
const COMPLETE = golden.cases.find((x) => x.name === 'test_complete_database_row_reaches_v2_determination')!.row
const ROW = { ...COMPLETE, state_of_residence: 'CA', county_of_residence: 'Los Angeles County', household_size: 1 }
const logicsId = () => 900_000_000 + Math.floor(Math.random() * 99_999_999)

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose response JSON in assertions only
type Json = Record<string, any>

describe.skipIf(!live)('433-A worksheet export (live)', () => {
  const env = { SUPABASE_URL, SUPABASE_SECRET_KEY } as unknown as Env
  let db: SupabaseClient
  const fixtures: FinancialFixture[] = []
  const paths: string[] = []
  const call = async (path: string, init: RequestInit = {}, over: Partial<Env> = {}) => {
    const res = await app.request(path, { headers: { 'content-type': 'application/json' }, ...init }, { ...env, ...over })
    return { status: res.status, body: (await res.json()) as Json }
  }
  const seed = async (opts: Parameters<typeof seedFinancialCase>[1]) => {
    const fx = await seedFinancialCase(env, opts)
    fixtures.push(fx)
    return fx
  }
  // One case with a request and a run, exported once.
  const exported = async () => {
    const fx = await seed({ row: ROW, logicsCaseId: logicsId(), withRequest: { items: [{ kind: 'upload', label: 'Pay stubs' }] } })
    const evaluated = await call(`/api/admin/cases/${fx.caseId}/evaluations`, { method: 'POST' })
    expect(evaluated.status).toBe(201)
    const runId = evaluated.body.run.id as string
    const first = await call(`/api/admin/cases/${fx.caseId}/evaluations/${runId}/worksheet`, { method: 'POST' })
    paths.push(`firm/${TEST_FIRM}/case/${fx.caseId}/worksheets/${runId}.pdf`)
    return { fx, runId, first }
  }
  const worksheets = async (caseId: string) =>
    (await db.from('documents').select('*').eq('case_id', caseId).eq('document_type', 'worksheet_433a')).data!

  beforeAll(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    db = createAdminClient(env)
  })
  afterAll(async () => {
    if (paths.length) await db.storage.from(BUCKET).remove(paths)
    for (const fx of fixtures) await fx.cleanup()
  })

  it('exports a run to one stored, hashed worksheet document and returns it again on re-export', async () => {
    const { fx, runId, first } = await exported()
    expect(first.status).toBe(201)
    expect(first.body).toMatchObject({ request_id: fx.requestId, already: false })
    expect(first.body.pages).toBeGreaterThanOrEqual(1)
    expect(first.body.file_name).toMatch(/^433A-screening-worksheet-\d+-\d{4}-\d{2}-\d{2}\.pdf$/)

    const docs = await worksheets(fx.caseId)
    expect(docs).toHaveLength(1)
    const doc = docs[0]
    expect(doc).toMatchObject({
      id: first.body.document_id,
      status: 'ready',
      request_item_id: null,
      mime_type: 'application/pdf',
      storage_key: `firm/${TEST_FIRM}/case/${fx.caseId}/worksheets/${runId}.pdf`,
    })
    expect(doc.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(Number(doc.size_bytes)).toBeGreaterThan(0)
    const head = await headBytes(env, doc.storage_key)
    expect(new TextDecoder().decode(head!.bytes.slice(0, 5))).toBe('%PDF-')

    const events = (await db.from('events').select('payload').eq('case_id', fx.caseId).eq('action', 'worksheet.generated')).data!
    expect(events).toHaveLength(1)
    expect(Object.keys(events[0].payload).sort()).toEqual(['document_id', 'pages', 'run_id'])
    process.stderr.write(`worksheet live sample: ${first.body.pages} page(s), ${doc.size_bytes} bytes\n`)

    const again = await call(`/api/admin/cases/${fx.caseId}/evaluations/${runId}/worksheet`, { method: 'POST' })
    expect(again.status).toBe(200)
    expect(again.body).toMatchObject({ document_id: doc.id, already: true, pages: first.body.pages, file_name: first.body.file_name })
    expect(await worksheets(fx.caseId)).toHaveLength(1)

    const listed = await call(`/api/admin/cases/${fx.caseId}/worksheets`)
    expect(listed.status).toBe(200)
    expect(listed.body.request_id).toBe(fx.requestId)
    expect(listed.body.worksheets).toEqual([
      expect.objectContaining({ id: doc.id, file_name: first.body.file_name, run_id: runId, sha256: doc.sha256 }),
    ])

    // A run of another case is not this case's run.
    const other = await seed({})
    expect((await call(`/api/admin/cases/${other.caseId}/evaluations/${runId}/worksheet`, { method: 'POST' })).status).toBe(404)
    expect(await worksheets(other.caseId)).toHaveLength(0)
  })
})
