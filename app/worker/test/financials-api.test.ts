import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createAdminClient } from '../src/db/client'
import { evaluateCase } from '../src/engine/intake-workflow'
import { fetchStandardsBundle, upsertProposals } from '../src/financials/rpc'
import { app } from '../src/index'
import { BundleStandardsRepository, isStandardsBundle } from '../src/standards/bundle-repository'
import { seedFinancialCase, TEST_FIRM, type FinancialFixture } from './fixtures/financials'

// FORM-04/05 tracer against the live project: GET financials -> accept a proposal -> evaluate
// against the county's standards -> one immutable run -> latest run.
// Run with `pnpm -C app run test:live:file worker/test/financials-api.test.ts`.
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
if (!live) process.stderr.write('financials api suite skipped: missing SUPABASE_URL or SUPABASE_SECRET_KEY\n')

const golden = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/engine/golden.json', import.meta.url).href), 'utf8')) as {
  cases: Array<{ name: string; row: Record<string, unknown> }>
}
const COMPLETE = golden.cases.find((x) => x.name === 'test_complete_database_row_reaches_v2_determination')!.row
const baseRow = (over: Record<string, unknown>) => ({
  ...COMPLETE,
  state_of_residence: 'CA',
  county_of_residence: 'Los Angeles County',
  ...over,
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose response JSON in assertions only
type Json = Record<string, any>

describe.skipIf(!live)('433-A financials API (live)', () => {
  const env = { SUPABASE_URL, SUPABASE_SECRET_KEY } as unknown as Env
  let db: SupabaseClient
  const fixtures: FinancialFixture[] = []
  const seed = async (row: Record<string, unknown>) => {
    const fx = await seedFinancialCase(env, { row })
    fixtures.push(fx)
    return fx
  }
  const call = async (path: string, init: RequestInit = {}) => {
    const res = await app.request(path, { headers: { 'content-type': 'application/json' }, ...init }, env)
    return { status: res.status, body: (await res.json()) as Json }
  }
  const runs = async (caseId: string) => (await db.from('determination_runs').select('*').eq('case_id', caseId)).data!
  const lineOf = (view: Json, column: string) =>
    view.sections.flatMap((s: Json) => s.lines).find((l: Json) => l.column === column)

  beforeAll(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    db = createAdminClient(env)
  })
  afterAll(async () => {
    for (const fx of fixtures) await fx.cleanup()
  })

  it('reads, accepts, evaluates against county standards and records one run', async () => {
    const fx = await seed(baseRow({ household_size: null }))
    await upsertProposals(env, {
      firmId: TEST_FIRM,
      caseId: fx.caseId,
      source: 'intake',
      generatorVersion: 'test',
      proposals: [{
        canonical_column: 'household_size',
        proposed_value: 1,
        source_refs: [{ kind: 'intake_answer', id: 'household_size', label: 'Intake answer' }],
        method: 'intake_answer',
        window_start: null,
        window_end: null,
        reliability: 'C',
      }],
    })
    const base = `/api/admin/cases/${fx.caseId}`

    const before = await call(`${base}/financials`)
    expect(before.status).toBe(200)
    const proposed = lineOf(before.body, 'household_size')
    expect(proposed.status).toBe('proposed')
    expect(proposed.proposals).toHaveLength(1)
    expect(proposed.proposals[0].source).toBe('intake')
    expect(before.body.required.missing).toEqual(['household_size'])

    const decided = await call(`${base}/financials/household_size/decide`, {
      method: 'POST',
      body: JSON.stringify({ action: 'accept', proposal_id: proposed.proposals[0].id }),
    })
    expect(decided.status).toBe(200)
    expect(decided.body).toMatchObject({ column: 'household_size', action: 'accept' })

    const after = await call(`${base}/financials`)
    const confirmed = lineOf(after.body, 'household_size')
    expect(confirmed).toMatchObject({ value: 1, status: 'confirmed' })
    expect(confirmed.confirmed).toMatchObject({ source: 'intake', by_name: 'Test agent' })
    expect(after.body.required.confirmed).toBe(after.body.required.total)
    expect(after.body.required.total).toBe(63)

    const evaluated = await call(`${base}/evaluations`, { method: 'POST' })
    expect(evaluated.status).toBe(201)
    const row = (await db.from('case_financial_data').select('*').eq('case_id', fx.caseId).single()).data!
    const bundle = await fetchStandardsBundle(env, { state: 'CA', county: 'Los Angeles County', householdSize: 1, vehicleCount: 1 })
    if (!isStandardsBundle(bundle)) throw new Error('bundle shape')
    const expected = evaluateCase(row, new BundleStandardsRepository(bundle)).determination!
    const run = evaluated.body.run
    expect(evaluated.body.outcome).toEqual({ kind: 'determination' })
    expect(run.path).toBe(expected.path)
    expect(run.reason).toBe(expected.reason)
    expect(run.suggested_offer_or_payment).toBe(expected.suggested_offer_or_payment)
    expect(run.standards_inputs.housing).toBe(3001)
    expect(run.next).toBe('A tax professional must review this result before anything is filed.')
    expect(run.nre_lines).toHaveLength(7)
    expect(run.engine_version).toBeTruthy()
    expect(run.created_by_name).toBe('Test agent')

    const stored = await runs(fx.caseId)
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ id: run.id, firm_id: TEST_FIRM, created_by: STAFF_ID })
    // PostgREST renders numeric(14,2) as JSON numbers (recorded in 07-04-SUMMARY).
    expect(typeof stored[0].monthly_income).toBe('number')
    expect(typeof row.gross_wages_taxpayer).toBe('number')
    const events = (await db.from('events').select('payload').eq('case_id', fx.caseId).eq('action', 'evaluation.created')).data!
    expect(events).toHaveLength(1)
    expect(Object.values(events[0].payload).every((v) => typeof v === 'string')).toBe(true)

    const latest = await call(`${base}/evaluations/latest`)
    expect(latest.status).toBe(200)
    expect(latest.body.run.id).toBe(run.id)
    expect(latest.body.run.created_by_name).toBe('Test agent')
  })

  it('a missing fact returns information_needed with labels and writes no run', async () => {
    const fx = await seed(baseRow({ age_spouse: null }))
    const res = await call(`/api/admin/cases/${fx.caseId}/evaluations`, { method: 'POST' })
    expect(res.status).toBe(200)
    expect(res.body.run).toBeNull()
    expect(res.body.outcome.kind).toBe('information_needed')
    expect(res.body.outcome.missing).toEqual([{ column: 'age_spouse', label: 'Spouse age' }])
    expect(JSON.stringify(res.body.outcome)).not.toMatch(/\d/)
    expect(await runs(fx.caseId)).toHaveLength(0)
    expect((await call(`/api/admin/cases/${fx.caseId}/evaluations/latest`)).body).toEqual({ run: null })
  })

  it('an unknown county returns standards_unavailable and writes no run', async () => {
    const fx = await seed(baseRow({ household_size: 1, county_of_residence: 'Nowhere County' }))
    const res = await call(`/api/admin/cases/${fx.caseId}/evaluations`, { method: 'POST' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ run: null, outcome: { kind: 'standards_unavailable', message: 'Standards unavailable' } })
    expect(await runs(fx.caseId)).toHaveLength(0)
  })
})
