import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createAdminClient } from '../src/db/client'
import { app } from '../src/index'
import { BUCKET } from '../src/storage/case-documents'
import { seedFinancialCase, TEST_FIRM, type FinancialFixture } from './fixtures/financials'

// FORM-03 / D-17 tracer against the live project: an uploaded IRS transcript -> POST extract ->
// document-source proposals in GET financials. Run with
// `pnpm -C app run test:live:file worker/test/financials-extract.test.ts`.
vi.mock('../src/middleware/staff-auth', async () => {
  const { createMiddleware } = await import('hono/factory')
  const { TEST_FIRM: firmId } = await import('./fixtures/financials')
  return {
    staffAuth: createMiddleware(async (c, next) => {
      c.set('staff', { userId: '00000000-0000-0000-0000-0000000000a7', firmId, role: 'admin', displayName: 'Test agent' })
      await next()
    }),
  }
})

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env
const live = Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY)
if (!live) process.stderr.write('financials extract suite skipped: missing SUPABASE_URL or SUPABASE_SECRET_KEY\n')

const TRANSCRIPT = 'examples/01_marcus_delgado_CNC/01_IRS_Account_Transcript.pdf'
const repoFile = (rel: string) => readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url).href))
const golden = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/engine/golden-extract.json', import.meta.url).href), 'utf8')) as {
  pdfs: Array<{ path: string; expected: Record<string, unknown> }>
}
const EXPECTED = golden.pdfs.find((x) => x.path === TRANSCRIPT)!.expected

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose response JSON in assertions only
type Json = Record<string, any>

describe.skipIf(!live)('financials extract (live)', { timeout: 60_000 }, () => {
  const env = { SUPABASE_URL, SUPABASE_SECRET_KEY, LOGICS_MODE: 'fake' } as unknown as Env
  let db: SupabaseClient
  const fixtures: FinancialFixture[] = []
  const objects: string[] = []
  const extract = (caseId: string) => app.request(`/api/admin/cases/${caseId}/financials/extract`, { method: 'POST' }, env)

  beforeAll(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    db = createAdminClient(env)
  })
  afterAll(async () => {
    if (objects.length) await db.storage.from(BUCKET).remove(objects)
    for (const fx of fixtures) await fx.cleanup()
  })

  async function addDocument(fx: FinancialFixture, name: string, bytes: Uint8Array, mime: string, documentType: string) {
    const id = crypto.randomUUID()
    const key = `firm/${fx.firmId}/case/${fx.caseId}/item/${fx.itemIds.Upload}/${id}/${name}`
    const up = await db.storage.from(BUCKET).upload(key, bytes, { contentType: mime })
    if (up.error) throw new Error(up.error.message)
    objects.push(key)
    const doc = await db.from('documents').insert({
      id,
      case_id: fx.caseId,
      request_item_id: fx.itemIds.Upload,
      storage_key: key,
      original_filename: name,
      mime_type: mime,
      document_type: documentType,
      size_bytes: bytes.byteLength,
      sha256: '0'.repeat(64),
      status: 'ready',
      uploaded_by_actor: 'client',
    })
    if (doc.error) throw new Error(doc.error.message)
    return id
  }

  it('an uploaded transcript becomes Document proposals; a second run keeps them', async () => {
    const fx = await seedFinancialCase(env, { withRequest: { items: [{ kind: 'upload', label: 'Upload' }] } })
    fixtures.push(fx)
    const docId = await addDocument(fx, '01_IRS_Account_Transcript.pdf', repoFile(TRANSCRIPT), 'application/pdf', 'irs_transcripts')
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const imageId = await addDocument(fx, 'photo.png', png, 'image/png', 'irs_transcripts')

    const started = Date.now()
    const res = await extract(fx.caseId)
    const elapsed = Date.now() - started
    expect(res.status).toBe(200)
    const first = (await res.json()) as Json
    process.stderr.write(`extract round trip (2 documents, Node, includes storage + RPC): ${elapsed} ms\n`)
    expect(first).toMatchObject({ documents: 2, parsed: 1, failed: [] })
    expect(first.skipped).toEqual([{ document_id: imageId, name: 'photo.png', reason: 'not_pdf' }])

    // Every golden column for this file except the never-from-documents state.
    const columns = Object.keys(EXPECTED).filter((k) => !k.startsWith('_') && k !== 'state_of_residence').sort()
    expect(columns).toContain('total_tax_owed')
    const rows = (await db.from('financial_proposals').select('*').eq('case_id', fx.caseId).eq('source', 'document').eq('status', 'proposed')).data!
    expect(rows.map((r) => r.canonical_column).sort()).toEqual(columns)
    expect(first.proposals).toEqual({ inserted: columns.length, kept: 0, superseded: 0 })
    for (const r of rows) {
      expect(r).toMatchObject({ reliability: 'B', method: 'regex_extract', proposed_value: EXPECTED[r.canonical_column] })
      expect(r.source_refs).toEqual([{ kind: 'document', id: docId, label: '01_IRS_Account_Transcript.pdf' }])
    }

    // The 433-A view shows the line as proposed from the Document source.
    const view = JSON.stringify(await (await app.request(`/api/admin/cases/${fx.caseId}/financials`, {}, env)).json())
    expect(view).toContain('"source":"document"')

    // Unchanged documents: nothing new, nothing superseded.
    const second = (await (await extract(fx.caseId)).json()) as Json
    expect(second.proposals).toEqual({ inserted: 0, kept: first.proposals.inserted, superseded: 0 })

    // Never written to the canonical row (D-06); the event carries counts only (D-20).
    expect((await db.from('case_financial_data').select('case_id').eq('case_id', fx.caseId)).data).toEqual([])
    const events = (await db.from('events').select('payload').eq('case_id', fx.caseId).eq('action', 'financials.extracted')).data!
    expect(events).toHaveLength(2)
    expect(events[0].payload).toEqual({ documents: 2, parsed: 1, failed: 0, skipped: 1 })
  })

  it('a document that no longer parses supersedes its old proposals; a foreign case is 404', async () => {
    const fx = await seedFinancialCase(env, { withRequest: { items: [{ kind: 'upload', label: 'Upload' }] } })
    fixtures.push(fx)
    const docId = await addDocument(fx, 'transcript.pdf', repoFile(TRANSCRIPT), 'application/pdf', 'irs_transcripts')
    const first = (await (await extract(fx.caseId)).json()) as Json
    expect(first.proposals.inserted).toBeGreaterThan(0)
    await db.from('documents').update({ status: 'rejected' }).eq('id', docId)
    await addDocument(fx, 'not-a-form.pdf', new TextEncoder().encode('%PDF-1.4\n%%EOF\n'), 'application/pdf', 'other')
    const second = (await (await extract(fx.caseId)).json()) as Json
    expect(second).toMatchObject({ documents: 1, parsed: 0, failed: [{ name: 'not-a-form.pdf', reason: 'no_template' }] })
    expect(second.proposals).toEqual({ inserted: 0, kept: 0, superseded: first.proposals.inserted })

    const other = (await db.from('cases').select('id').neq('firm_id', TEST_FIRM).limit(1).maybeSingle()).data as { id: string } | null
    expect((await extract(other?.id ?? crypto.randomUUID())).status).toBe(404)
    expect((await extract('nope')).status).toBe(404)
  })
})
