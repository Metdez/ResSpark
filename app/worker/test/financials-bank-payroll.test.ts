import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createAdminClient } from '../src/db/client'
import { runFinancialsPropose } from '../src/financials/propose/run'
import { app } from '../src/index'
import { fixtureText } from './fixtures/connections'
import { seedFinancialCase, type FinancialFixture } from './fixtures/financials'

// FORM-03 / FORM-07 against the live project: payroll and bank connections -> proposals.
// Run with `pnpm -C app run test:live:file worker/test/financials-bank-payroll.test.ts`.
const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env
const live = Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY)
if (!live) process.stderr.write('financials bank/payroll suite skipped: missing SUPABASE_URL or SUPABASE_SECRET_KEY\n')

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose row JSON in assertions only
type Json = Record<string, any>
const PAYROLL = 'Connect your payroll'
const BANK = 'Connect your bank'

describe.skipIf(!live)('financials bank and payroll proposals (live)', { timeout: 30_000 }, () => {
  const env = { SUPABASE_URL, SUPABASE_SECRET_KEY, LOGICS_MODE: 'fake' } as unknown as Env
  const NOW = new Date('2026-10-11T12:00:00Z')
  let db: SupabaseClient
  const fixtures: FinancialFixture[] = []

  const seed = async () => {
    const fx = await seedFinancialCase(env, { withRequest: { items: [{ kind: 'payroll_connect', label: PAYROLL }, { kind: 'bank_connect', label: BANK }] } })
    fixtures.push(fx)
    return fx
  }
  const insertConnection = async (fx: FinancialFixture, kind: 'payroll' | 'bank', data: Record<string, unknown>, status = 'done') =>
    (
      await db
        .from('connections')
        .insert({
          firm_id: fx.firmId,
          case_id: fx.caseId,
          request_id: fx.requestId,
          request_item_id: fx.itemIds[kind === 'payroll' ? PAYROLL : BANK],
          provider: kind === 'payroll' ? 'truv' : 'plaid',
          kind,
          status,
          data,
        })
        .select('id')
        .single()
    ).data as { id: string }
  const open = async (caseId: string, source: string) =>
    ((await db.from('financial_proposals').select('*').eq('case_id', caseId).eq('source', source).eq('status', 'proposed')).data ?? []) as Json[]
  const valueOf = (rows: Json[], column: string) => rows.find((r) => r.canonical_column === column)
  const line = (view: Json, column: string) =>
    (view.sections as Json[]).flatMap((s) => s.lines as Json[]).find((l) => l.column === column)

  beforeAll(() => {
    db = createAdminClient(env)
  })
  afterAll(async () => {
    for (const fx of fixtures) {
      if (fx.requestId) await db.from('connections').delete().eq('request_id', fx.requestId)
      await fx.cleanup()
    }
  })

  it('a done Truv connection proposes windowed wages, deductions and flags, visible in GET financials', async () => {
    const fx = await seed()
    const conn = await insertConnection(fx, 'payroll', JSON.parse(fixtureText('truv/income_report_proposals.json')))
    const result = await runFinancialsPropose(env, fx.caseId, NOW)
    expect(result.payroll).toMatchObject({ inserted: 6 })
    const rows = await open(fx.caseId, 'truv')
    expect(valueOf(rows, 'gross_wages_taxpayer')).toMatchObject({ proposed_value: 9341.67, reliability: 'A' })
    expect(valueOf(rows, 'actual_current_taxes')).toMatchObject({ proposed_value: 1410.92 })
    expect(valueOf(rows, 'is_wage_earner')).toMatchObject({ proposed_value: true })
    expect(valueOf(rows, 'gross_wages_taxpayer')!.source_refs[0]).toEqual({
      kind: 'pay_stub',
      id: `${conn.id}:emp_1:2026-09-18:3003`,
      label: 'Acme Inc · 2026-09-18',
    })

    const view = (await (await app.request(`/api/admin/cases/${fx.caseId}/financials`, {}, env)).json()) as Json
    const wages = line(view, 'gross_wages_taxpayer')
    expect(wages.status).toBe('proposed')
    expect(wages.proposals[0]).toMatchObject({ source: 'truv', window_start: '2026-07-01', window_end: '2026-09-30', proposed_value: 9341.67 })

    // Idempotent rerun.
    expect((await runFinancialsPropose(env, fx.caseId, NOW)).payroll).toMatchObject({ inserted: 0, kept: 6 })
  })
})
