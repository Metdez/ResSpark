import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { proposeBank } from './bank'
import type { ProposeContext } from './run'

// Query results for the mocked admin client in call order: connections, earliest txn per
// connection, accounts. `rpc` answers financial_bank_monthly.
const results: Array<{ data: unknown; error: null }> = []
const rpc = vi.fn()
vi.mock('../../db/client', () => ({
  createAdminClient: () => {
    const q: Record<string, unknown> = { rpc }
    for (const m of ['from', 'select', 'eq', 'in', 'order', 'limit']) q[m] = () => q
    q.then = (resolve: (v: unknown) => void) => resolve(results.shift())
    return q
  },
}))

const WINDOW3 = { start: '2026-07-01', end: '2026-09-30', months: 3 as const }
const WINDOW6 = { start: '2026-04-01', end: '2026-09-30', months: 6 as const }
const ctx = (window: ProposeContext['window'] = WINDOW3) =>
  ({ env: {}, firmId: 'F', caseId: 'C', window, settings: { window_months: window.months, spouse_employer_ids: [] } }) as unknown as ProposeContext
const ok = (data: unknown) => ({ data, error: null })
const conn = (status = 'HISTORICAL_UPDATE_COMPLETE') => ({ id: 'k1', data: { transactions_update_status: status } })
const CHECKING = { id: 'a1', name: 'Checking', mask: '0000', type: 'depository', balance_current: 1250.75 }
const SAVINGS = { id: 'a2', name: 'Savings', mask: '1111', type: 'depository', balance_current: '500.10' }
const CARD = { id: 'a3', name: 'Card', mask: '3333', type: 'credit', balance_current: 410 }
const monthRow = (canonical_column: string, treatment: string, month: string, amount_cents: number, txn_count = 1, reliability = 'B') => ({
  canonical_column,
  treatment,
  form_line: null,
  reliability,
  month,
  amount_cents,
  txn_count,
})
const ready = (accounts: unknown[] = [CHECKING, SAVINGS, CARD]) => results.push(ok([conn()]), ok([{ date: '2026-03-02' }]), ok(accounts))
const col = (out: Awaited<ReturnType<typeof proposeBank>>, c: string) => out!.proposals.find((p) => p.canonical_column === c)

beforeEach(() => {
  results.length = 0
  rpc.mockReset()
})

describe('proposeBank', () => {
  it('averages mapped expense and income columns over the window', async () => {
    ready()
    rpc.mockResolvedValue(
      ok([
        ...['2026-07-01', '2026-08-01', '2026-09-01'].map((m) => monthRow('actual_housing_utilities', 'expense', m, 150000)),
        monthRow('interest_dividends_royalties', 'income', '2026-08-01', 9000),
        monthRow('gross_wages_taxpayer', 'informational', '2026-08-01', 500000),
        monthRow('actual_food', 'expense', '2026-08-01', 0, 0),
      ])
    )
    const out = await proposeBank(ctx())
    expect(rpc).toHaveBeenCalledWith('financial_bank_monthly', { p_firm_id: 'F', p_case_id: 'C', p_window_start: '2026-07-01', p_window_end: '2026-09-30' })
    expect(col(out, 'actual_housing_utilities')).toMatchObject({
      proposed_value: 1500,
      method: 'sum_outflows_3mo_div_3',
      reliability: 'B',
      window_start: '2026-07-01',
      window_end: '2026-09-30',
    })
    expect(col(out, 'actual_housing_utilities')!.source_refs).toEqual([
      { kind: 'bank_account', id: 'a1', label: 'Checking ••0000' },
      { kind: 'bank_account', id: 'a2', label: 'Savings ••1111' },
      { kind: 'bank_account', id: 'a3', label: 'Card ••3333' },
    ])
    expect(col(out, 'interest_dividends_royalties')).toMatchObject({ proposed_value: 30, method: 'sum_inflows_3mo_div_3' })
    // Net salary deposits are never wages; zero transactions propose nothing.
    expect(col(out, 'gross_wages_taxpayer')).toBeUndefined()
    expect(col(out, 'actual_food')).toBeUndefined()
  })

  it('cash is the sum of depository current balances', async () => {
    ready()
    rpc.mockResolvedValue(ok([]))
    const out = await proposeBank(ctx())
    expect(col(out, 'cash_and_bank_balances')).toMatchObject({ proposed_value: 1750.85, method: 'sum_depository_balance_current', reliability: 'A', window_start: null })
    expect(col(out, 'cash_and_bank_balances')!.source_refs.map((r) => r.id)).toEqual(['a1', 'a2'])
  })

  it('no cash when a depository account has no balance', async () => {
    ready([CHECKING, { ...SAVINGS, balance_current: null }])
    rpc.mockResolvedValue(ok([]))
    expect(await proposeBank(ctx())).toEqual({ source: 'plaid', proposals: [] })
  })

  it('a 6-month window halves a 3-month total', async () => {
    results.push(ok([conn()]), ok([{ date: '2026-01-05' }]), ok([CARD]))
    rpc.mockResolvedValue(ok(['2026-07-01', '2026-08-01', '2026-09-01'].map((m) => monthRow('actual_housing_utilities', 'expense', m, 150000))))
    const out = await proposeBank(ctx(WINDOW6))
    expect(col(out, 'actual_housing_utilities')).toMatchObject({ proposed_value: 750, method: 'sum_outflows_6mo_div_6', window_start: '2026-04-01' })
  })

  it('a connection without complete history -> null (old rows kept)', async () => {
    results.push(ok([conn(), { id: 'k2', data: { transactions_update_status: 'INITIAL_UPDATE_COMPLETE' } }]), ok([{ date: '2026-03-02' }]))
    expect(await proposeBank(ctx())).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('the mapped "historical" status is accepted too', async () => {
    results.push(ok([conn('historical')]), ok([{ date: '2026-03-02' }]), ok([CARD]))
    rpc.mockResolvedValue(ok([]))
    expect(await proposeBank(ctx())).toEqual({ source: 'plaid', proposals: [] })
  })

  it('earliest transaction after the window start -> null', async () => {
    results.push(ok([conn()]), ok([{ date: '2026-07-15' }]))
    expect(await proposeBank(ctx())).toBeNull()
  })

  it('no bank connection -> []', async () => {
    results.push(ok([]))
    expect(await proposeBank(ctx())).toEqual({ source: 'plaid', proposals: [] })
  })
})

// T-07-33: category logic stays in SQL rows; no source file under financials/ names a category.
describe('category guard', () => {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const files = (readdirSync(root, { recursive: true }) as string[])
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => join(root, f))
  const TOKENS = [
    'INCOME_',
    'TRANSFER_',
    'LOAN_',
    'RENT_AND_UTILITIES',
    'FOOD_AND_DRINK',
    'GENERAL_SERVICES',
    'TRANSPORTATION_',
    'GOVERNMENT_AND',
    'socialsec',
    'garnishment',
    'medicare',
  ]

  it('reads the proposer files', () => {
    expect(files.some((f) => f.endsWith('bank.ts'))).toBe(true)
    expect(files.some((f) => f.endsWith('payroll.ts'))).toBe(true)
  })

  it.each(TOKENS)('no financials source file contains %s', (token) => {
    expect(files.filter((f) => readFileSync(f, 'utf8').includes(token))).toEqual([])
  })
})
