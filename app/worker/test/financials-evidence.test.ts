import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createAdminClient } from '../src/db/client'
import { runFinancialsPropose } from '../src/financials/propose/run'
import { app } from '../src/index'
import { seedFinancialCase, TEST_FIRM, type FinancialFixture } from './fixtures/financials'

// FORM-03 / D-10 against the live project: GET .../financials/:column/evidence.
// Run with `pnpm -C app run test:live:file worker/test/financials-evidence.test.ts`.
const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env
const live = Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY)
if (!live) process.stderr.write('financials evidence suite skipped: missing SUPABASE_URL or SUPABASE_SECRET_KEY\n')

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose response JSON in assertions only
type Json = Record<string, any>
const BANK = 'Connect your bank'

describe.skipIf(!live)('financials evidence (live)', { timeout: 30_000 }, () => {
  const env = { SUPABASE_URL, SUPABASE_SECRET_KEY, LOGICS_MODE: 'fake' } as unknown as Env
  const NOW = new Date('2026-10-11T12:00:00Z')
  let db: SupabaseClient
  const fixtures: FinancialFixture[] = []
  const get = (caseId: string, column: string, query = '') => app.request(`/api/admin/cases/${caseId}/financials/${column}/evidence${query}`, {}, env)

  beforeAll(() => {
    db = createAdminClient(env)
  })
  afterAll(async () => {
    for (const fx of fixtures) {
      if (fx.requestId) await db.from('connections').delete().eq('request_id', fx.requestId)
      await fx.cleanup()
    }
  })

  // The Plan 07 bank fixture: rent 1500 and car 400 in Jul-Sep, dividends, a transfer, a pending row and a June row.
  async function seedBank() {
    const fx = await seedFinancialCase(env, { withRequest: { items: [{ kind: 'bank_connect', label: BANK }] } })
    fixtures.push(fx)
    const conn = (
      await db
        .from('connections')
        .insert({ firm_id: fx.firmId, case_id: fx.caseId, request_id: fx.requestId, request_item_id: fx.itemIds[BANK], provider: 'plaid', kind: 'bank', status: 'done', data: { transactions_update_status: 'HISTORICAL_UPDATE_COMPLETE' } })
        .select('id')
        .single()
    ).data as { id: string }
    const account = (
      await db
        .from('bank_accounts')
        .insert({ connection_id: conn.id, external_account_id: 'acc_0710', name: 'Checking', mask: '0000', type: 'depository', subtype: 'checking', balance_current: 2500, balance_as_of: '2026-10-10T12:00:00Z' })
        .select('id')
        .single()
    ).data as { id: string }
    const tx = (date: string, amount: number, category: string, pending = false) => ({
      connection_id: conn.id,
      bank_account_id: account.id,
      plaid_transaction_id: `tx_0710_${crypto.randomUUID()}`,
      amount,
      date,
      name: category,
      category_detailed: category,
      pending,
    })
    const months = ['2026-07-10', '2026-08-10', '2026-09-10']
    const { error } = await db.from('bank_transactions').insert([
      ...months.map((d) => tx(d, 1500, 'RENT_AND_UTILITIES_RENT')),
      ...months.map((d) => tx(d, 400, 'LOAN_PAYMENTS_CAR_PAYMENT')),
      ...months.map((d) => tx(d, -30, 'INCOME_DIVIDENDS')),
      tx('2026-08-20', 5000, 'TRANSFER_OUT_ACCOUNT_TRANSFER'),
      tx('2026-09-25', 777, 'RENT_AND_UTILITIES_RENT', true),
      tx('2026-06-15', 999, 'RENT_AND_UTILITIES_RENT'),
    ])
    if (error) throw new Error(error.message)
    expect((await runFinancialsPropose(env, fx.caseId, NOW)).bank).toMatchObject({ inserted: 4 })
    return { fx, conn, account }
  }

  it('a bank-derived figure opens to its months, exact subtotals, transactions and the average', async () => {
    const { fx } = await seedBank()
    const res = await get(fx.caseId, 'actual_housing_utilities')
    expect(res.status).toBe(200)
    const view = (await res.json()) as Json
    expect(view).toMatchObject({ kind: 'bank', column: 'actual_housing_utilities', average: 1500, truncated: false, cross_check: null })
    expect(view.window).toEqual({ start: '2026-07-01', end: '2026-09-30', months: 3 })
    expect(view.months.map((m: Json) => [m.month, m.subtotal, m.transactions.length])).toEqual([
      ['2026-07-01', 1500, 1],
      ['2026-08-01', 1500, 1],
      ['2026-09-01', 1500, 1],
    ])
    expect(view.months[0].transactions[0]).toMatchObject({ date: '2026-07-10', amount: 1500, account: 'Checking ••0000', name: 'RENT_AND_UTILITIES_RENT' })
    // No pending, transfer or June row; no account number or storage key anywhere.
    const amounts = view.months.flatMap((m: Json) => m.transactions.map((t: Json) => t.amount))
    expect(amounts).not.toContain(777)
    expect(amounts).not.toContain(5000)
    expect(JSON.stringify(view)).not.toMatch(/acc_0710|external_account_id|storage_key/)

    // Inflows read positive.
    const income = (await (await get(fx.caseId, 'interest_dividends_royalties')).json()) as Json
    expect(income.months.map((m: Json) => m.subtotal)).toEqual([30, 30, 30])
    expect(income.months[0].transactions[0].amount).toBe(30)
  })

  it('a chosen proposal id must belong to the case and column; bad input is 400; a foreign case is 404', async () => {
    const { fx } = await seedBank()
    const own = (await db.from('financial_proposals').select('id').eq('case_id', fx.caseId).eq('canonical_column', 'actual_vehicle_loan_lease').single()).data as { id: string }
    expect(((await (await get(fx.caseId, 'actual_vehicle_loan_lease', `?proposal_id=${own.id}`)).json()) as Json).average).toBe(400)
    expect((await get(fx.caseId, 'actual_housing_utilities', `?proposal_id=${own.id}`)).status).toBe(404)
    expect((await get(fx.caseId, 'not_a_column')).status).toBe(400)
    expect((await get(fx.caseId, 'actual_housing_utilities', '?proposal_id=nope')).status).toBe(400)
    expect(await (await get(fx.caseId, 'net_rental_income')).json()).toEqual({ kind: 'none', column: 'net_rental_income', label: expect.any(String) })

    // Another firm's case (read-only lookup; nothing is written outside the test firm) or a random id.
    const other = (await db.from('cases').select('id').neq('firm_id', TEST_FIRM).limit(1).maybeSingle()).data as { id: string } | null
    expect((await get(other?.id ?? crypto.randomUUID(), 'actual_housing_utilities')).status).toBe(404)
  })
})
