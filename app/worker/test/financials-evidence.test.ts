import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { QUESTION_BY_ID } from '../../shared/questions'
import { createAdminClient } from '../src/db/client'
import { runFinancialsPropose } from '../src/financials/propose/run'
import { app } from '../src/index'
import { BUCKET } from '../src/storage/case-documents'
import { fixtureText } from './fixtures/connections'
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
const PAYROLL = 'Connect your payroll'

describe.skipIf(!live)('financials evidence (live)', { timeout: 30_000 }, () => {
  const env = { SUPABASE_URL, SUPABASE_SECRET_KEY, LOGICS_MODE: 'fake' } as unknown as Env
  const NOW = new Date('2026-10-11T12:00:00Z')
  let db: SupabaseClient
  const fixtures: FinancialFixture[] = []
  const objects: string[] = []
  const get = (caseId: string, column: string, query = '') => app.request(`/api/admin/cases/${caseId}/financials/${column}/evidence${query}`, {}, env)

  beforeAll(() => {
    db = createAdminClient(env)
  })
  afterAll(async () => {
    if (objects.length) await db.storage.from(BUCKET).remove(objects)
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

  it('cash opens to each account with its balance and as-of time, never an account number', async () => {
    const { fx, account } = await seedBank()
    const view = (await (await get(fx.caseId, 'cash_and_bank_balances')).json()) as Json
    expect(view).toMatchObject({ kind: 'balances', total: 2500 })
    expect(view.accounts).toEqual([
      { id: account.id, account: 'Checking ••0000', type: 'depository', subtype: 'checking', balance_current: 2500, balance_as_of: expect.stringMatching(/^2026-10-10T12:00:00/) },
    ])
    expect(JSON.stringify(view)).not.toContain('acc_0710')
  })

  it('a Truv wage opens to its stubs, the formula and a 300-second signed link where a stub PDF is stored', async () => {
    const fx = await seedFinancialCase(env, { withRequest: { items: [{ kind: 'payroll_connect', label: PAYROLL }] } })
    fixtures.push(fx)
    const conn = (
      await db
        .from('connections')
        .insert({ firm_id: fx.firmId, case_id: fx.caseId, request_id: fx.requestId, request_item_id: fx.itemIds[PAYROLL], provider: 'truv', kind: 'payroll', status: 'done', data: JSON.parse(fixtureText('truv/income_report_proposals.json')) })
        .select('id')
        .single()
    ).data as { id: string }
    expect((await runFinancialsPropose(env, fx.caseId, NOW)).payroll).toMatchObject({ inserted: 6 })
    // One stored stub, at the path Phase 4 uses (payroll/<company>-<employer_id>/paystub-<date>-<check>.pdf).
    const key = `firm/${fx.firmId}/case/${fx.caseId}/item/${fx.itemIds[PAYROLL]}/payroll/acme-inc-emp_1/paystub-2026-09-18-3003.pdf`
    const bytes = new TextEncoder().encode('%PDF-1.4\n%%EOF\n')
    const up = await db.storage.from(BUCKET).upload(key, bytes, { contentType: 'application/pdf' })
    if (up.error) throw new Error(up.error.message)
    objects.push(key)
    const doc = await db.from('documents').insert({
      case_id: fx.caseId,
      request_item_id: fx.itemIds[PAYROLL],
      connection_id: conn.id,
      storage_key: key,
      original_filename: 'paystub-2026-09-18-3003.pdf',
      mime_type: 'application/pdf',
      document_type: 'pay_stub',
      size_bytes: bytes.byteLength,
      sha256: '0'.repeat(64),
      status: 'ready',
      uploaded_by_actor: 'provider:truv',
    })
    if (doc.error) throw new Error(doc.error.message)

    const view = (await (await get(fx.caseId, 'gross_wages_taxpayer')).json()) as Json
    expect(view).toMatchObject({ kind: 'payroll', value: 9341.67, method: 'mean_gross_pay_x_periods_div_12', window: { start: '2026-07-01', end: '2026-09-30' }, cross_check: null })
    expect(view.stubs).toHaveLength(5)
    const acme = view.stubs.find((s: Json) => s.pay_date === '2026-09-18')
    expect(acme).toMatchObject({ employer: 'Acme Inc', gross: 2650, frequency: 'biweekly' })
    expect(acme.document_url.startsWith(SUPABASE_URL!)).toBe(true)
    expect(acme.document_url).toContain('token=')
    expect(view.stubs.find((s: Json) => s.pay_date === '2026-09-15')).toMatchObject({ employer: 'Beta LLC', gross: 1800, frequency: 'semimonthly', document_url: null })
    expect(view.formula).toEqual([
      { employer: 'Acme Inc', sum: 7950, stubs: 3, periods_per_year: 26, monthly: 5741.67 },
      { employer: 'Beta LLC', sum: 3600, stubs: 2, periods_per_year: 24, monthly: 3600 },
    ])
    // Only the signed URL carries the path; the bare storage key is never a field.
    expect(Object.values(acme)).not.toContain(key)
  })

  it('intake, Logics, address and staff figures open to their own evidence', async () => {
    const fx = await seedFinancialCase(env)
    fixtures.push(fx)
    const proposal = (over: Record<string, unknown>) => ({ firm_id: fx.firmId, case_id: fx.caseId, method: 'test', reliability: 'B', generator_version: 'test', ...over })
    const { error } = await db.from('financial_proposals').insert([
      proposal({ canonical_column: 'household_size', proposed_value: 3, source: 'intake', source_refs: [{ kind: 'intake_answer', id: crypto.randomUUID(), label: 'Client answer in the portal' }] }),
      proposal({ canonical_column: 'total_tax_owed', proposed_value: 12345.67, source: 'logics', source_refs: [{ kind: 'logics_field', id: 'TaxLiability', label: 'Logics TaxLiability' }] }),
    ])
    if (error) throw new Error(error.message)
    const intake = (await (await get(fx.caseId, 'household_size')).json()) as Json
    expect(intake).toMatchObject({ kind: 'intake', prompt: QUESTION_BY_ID.household_size.prompt, answer: 3, answered_at: expect.any(String) })
    expect(await (await get(fx.caseId, 'total_tax_owed')).json()).toMatchObject({ kind: 'logics', field: 'TaxLiability', value: 12345.67, fetched_at: expect.any(String) })

    // A confirmed USPS address: the address proposer proposes the IRS county from the FIPS.
    const addr = await db
      .from('cases')
      .update({ address_line1: '200 N Spring St', city: 'Los Angeles', state_code: 'CA', zip5: '90012', county_name: 'Los Angeles', county_fips: '06037', address_verified: true, address_source: 'smarty', address_confirmed_at: new Date().toISOString() })
      .eq('id', fx.caseId)
    if (addr.error) throw new Error(addr.error.message)
    await runFinancialsPropose(env, fx.caseId, NOW)
    const county = (await (await get(fx.caseId, 'county_of_residence')).json()) as Json
    expect(county).toMatchObject({ kind: 'address', fips: '06037', county: expect.stringContaining('Los Angeles'), address: { line1: '200 N Spring St', city: 'Los Angeles', state_code: 'CA', zip5: '90012' } })

    const decided = await app.request(
      `/api/admin/cases/${fx.caseId}/financials/net_rental_income/decide`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'known_zero' }) },
      env
    )
    expect(decided.status).toBe(200)
    expect(await (await get(fx.caseId, 'net_rental_income')).json()).toMatchObject({ kind: 'staff', by_name: 'Test agent', value: 0, at: expect.any(String), note: null })
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
