// Plaid source (D-09; RESEARCH Pattern 5, Pitfall 8): monthly averages summed in SQL by
// financial_bank_monthly, and cash from stored /accounts/get balances. Category mapping lives in
// plaid_category_map rows, never in this file; salary deposits are informational there, so never wages.
import { createAdminClient } from '../../db/client'
import type { ProposalInput, Reliability, SourceRef } from '../rpc'
import { centsToNumber, divHalfUp, toCents } from './cents'
import type { ProposeContext } from './run'

// Raw Plaid status or the mapped provider status; older rows store either.
const HISTORY_COMPLETE = ['HISTORICAL_UPDATE_COMPLETE', 'historical']

interface MonthlyRow {
  canonical_column: string
  treatment: string
  reliability: Reliability | null
  amount_cents: number | string
  txn_count: number
}
interface AccountRow {
  id: string
  name: string | null
  mask: string | null
  type: string | null
  balance_current: number | string | null
}

const weaker = (a: Reliability, b: Reliability): Reliability => (a > b ? a : b)

export async function proposeBank(ctx: ProposeContext) {
  const db = createAdminClient(ctx.env)
  const conns = await db
    .from('connections')
    .select('id, data')
    .eq('firm_id', ctx.firmId)
    .eq('case_id', ctx.caseId)
    .eq('kind', 'bank')
    .in('status', ['connected', 'syncing', 'done'])
  if (conns.error) throw new Error('bank_lookup_failed')
  const connections = conns.data as Array<{ id: string; data: Record<string, unknown> | null }>
  if (connections.length === 0) return { source: 'plaid' as const, proposals: [] }

  // Readiness gate (T-07-30): partial history would understate every average, so skip and keep old rows.
  for (const c of connections) {
    if (!HISTORY_COMPLETE.includes(c.data?.transactions_update_status as string)) return null
    const first = await db.from('bank_transactions').select('date').eq('connection_id', c.id).order('date').limit(1)
    if (first.error) throw new Error('bank_lookup_failed')
    const earliest = (first.data as Array<{ date: string }>)[0]?.date
    if (!earliest || earliest > ctx.window.start) return null
  }

  const accounts = await db
    .from('bank_accounts')
    .select('id, name, mask, type, balance_current')
    .in('connection_id', connections.map((c) => c.id))
    .order('id')
  if (accounts.error) throw new Error('bank_lookup_failed')
  const rows = accounts.data as AccountRow[]
  const ref = (a: AccountRow): SourceRef => ({ kind: 'bank_account', id: a.id, label: `${a.name ?? 'Account'} ••${a.mask ?? '????'}` })
  const refs = rows.map(ref)

  const { start, end, months } = ctx.window
  const monthly = await db.rpc('financial_bank_monthly', { p_firm_id: ctx.firmId, p_case_id: ctx.caseId, p_window_start: start, p_window_end: end })
  if (monthly.error) throw new Error('bank_monthly_failed')
  const totals = new Map<string, { cents: number; count: number; treatment: string; reliability: Reliability }>()
  for (const r of monthly.data as MonthlyRow[]) {
    if (r.treatment !== 'income' && r.treatment !== 'expense') continue // informational rows are a cross-check only
    const t = totals.get(r.canonical_column)
    const reliability = r.reliability ?? 'C'
    totals.set(r.canonical_column, {
      cents: (t?.cents ?? 0) + Number(r.amount_cents),
      count: (t?.count ?? 0) + r.txn_count,
      treatment: t?.treatment ?? r.treatment,
      reliability: t ? weaker(t.reliability, reliability) : reliability,
    })
  }

  const out: ProposalInput[] = []
  for (const [column, t] of totals) {
    if (t.count === 0) continue // no data, no proposal (D-07)
    out.push({
      canonical_column: column,
      proposed_value: centsToNumber(divHalfUp(t.cents, months)),
      source_refs: refs,
      method: `sum_${t.treatment === 'income' ? 'inflows' : 'outflows'}_${months}mo_div_${months}`,
      window_start: start,
      window_end: end,
      reliability: t.reliability,
    })
  }

  // Cash only when every depository account has a stored current balance.
  const depository = rows.filter((a) => a.type === 'depository')
  if (depository.length > 0 && depository.every((a) => a.balance_current !== null)) {
    out.push({
      canonical_column: 'cash_and_bank_balances',
      proposed_value: centsToNumber(depository.reduce((sum, a) => sum + toCents(String(a.balance_current)), 0)),
      source_refs: depository.map(ref),
      method: 'sum_depository_balance_current',
      window_start: null,
      window_end: null,
      reliability: 'A',
    })
  }
  return { source: 'plaid' as const, proposals: out }
}
