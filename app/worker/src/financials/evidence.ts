// The evidence behind one 433-A figure (D-10, FORM-03): what a proposal was computed from.
// Every read is scoped by firm and case; amounts come from SQL or the stored proposal, never recomputed here.
import { createAdminClient } from '../db/client'
import { labelFor } from './lines'

type DbEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>
type Db = ReturnType<typeof createAdminClient>
type Ref = { kind: string; id: string; label: string }

export interface BankTxn {
  id: string
  date: string
  name: string | null
  merchant_name: string | null
  amount: number
  account: string
}
export type CrossCheck = { label: string; monthly: number } | null
type Base = { column: string; label: string; proposal_id: string }

export type EvidenceView =
  | (Base & {
      kind: 'bank'
      window: { start: string; end: string; months: number }
      months: Array<{ month: string; subtotal: number; transactions: BankTxn[] }>
      average: number
      truncated: boolean
      cross_check: CrossCheck
    })
  | { kind: 'none'; column: string; label: string }

export interface EvidenceProposal {
  id: string
  canonical_column: string
  proposed_value: unknown
  source: string
  source_refs: Ref[]
  method: string
  window_start: string | null
  window_end: string | null
  status: string
  decided_value: unknown
  decision_note: string | null
  decided_by: string | null
  decided_at: string | null
  created_at: string
}

const SELECT =
  'id, canonical_column, proposed_value, source, source_refs, method, window_start, window_end, status, decided_value, decision_note, decided_by, decided_at, created_at'
export const MAX_TRANSACTIONS = 500 // T-07-44
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v))

// Pure: which evidence a proposal opens to.
export function evidenceKind(p: Pick<EvidenceProposal, 'source' | 'canonical_column'>): EvidenceView['kind'] {
  if (p.source === 'plaid') return 'bank'
  return 'none'
}

// Pure: 'YYYY-MM-01' for every calendar month the window touches, oldest first.
export function windowMonths(start: string, end: string): string[] {
  const out: string[] = []
  let [y, m] = [Number(start.slice(0, 4)), Number(start.slice(5, 7))]
  const last = end.slice(0, 7)
  for (let guard = 0; guard < 24; guard++) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    if (key > last) break
    out.push(`${key}-01`)
    ;[y, m] = m === 12 ? [y + 1, 1] : [y, m + 1]
  }
  return out
}

// The chosen proposal, else the confirming one, else the newest proposed; undefined = the id is not this case's.
async function pickProposal(db: Db, p: { firmId: string; caseId: string; column: string; proposalId: string | null }) {
  let q = db.from('financial_proposals').select(SELECT).eq('firm_id', p.firmId).eq('case_id', p.caseId).eq('canonical_column', p.column)
  q = p.proposalId ? q.eq('id', p.proposalId) : q.neq('status', 'superseded')
  const { data, error } = await q.order('created_at', { ascending: false }).limit(50)
  if (error) throw new Error('proposals_lookup_failed')
  const rows = data as EvidenceProposal[]
  if (p.proposalId) return rows[0]
  const confirming = rows
    .filter((r) => r.status === 'accepted' || r.status === 'edited')
    .sort((a, b) => (b.decided_at ?? '').localeCompare(a.decided_at ?? ''))[0]
  return confirming ?? rows.find((r) => r.status === 'proposed') ?? null
}

// null = no such case in this firm (or a proposal id that is not the case's): the route answers 404.
export async function buildEvidence(
  env: DbEnv,
  p: { firmId: string; caseId: string; column: string; proposalId: string | null }
): Promise<EvidenceView | null> {
  const db = createAdminClient(env)
  const found = await db.from('cases').select('id').eq('firm_id', p.firmId).eq('id', p.caseId).maybeSingle()
  if (found.error) throw new Error('case_lookup_failed')
  if (!found.data) return null
  const proposal = await pickProposal(db, p)
  if (proposal === undefined) return null
  const label = labelFor(p.column)
  if (!proposal) return { kind: 'none', column: p.column, label }
  const base: Base = { column: p.column, label, proposal_id: proposal.id }
  switch (evidenceKind(proposal)) {
    case 'bank':
      return bankEvidence(db, p, proposal, base)
    default:
      return { kind: 'none', column: p.column, label }
  }
}

// The case's bank connections (same filter as financial_bank_monthly) and their account labels.
async function bankScope(db: Db, firmId: string, caseId: string) {
  const conns = await db.from('connections').select('id').eq('firm_id', firmId).eq('case_id', caseId).eq('kind', 'bank').neq('status', 'removed')
  if (conns.error) throw new Error('bank_lookup_failed')
  const ids = (conns.data as Array<{ id: string }>).map((c) => c.id)
  return { ids }
}

async function monthlyRows(db: Db, p: { firmId: string; caseId: string }, start: string, end: string) {
  const res = await db.rpc('financial_bank_monthly', { p_firm_id: p.firmId, p_case_id: p.caseId, p_window_start: start, p_window_end: end })
  if (res.error) throw new Error('bank_monthly_failed')
  return res.data as Array<{ canonical_column: string; treatment: string; month: string; amount_cents: number | string; txn_count: number }>
}

async function bankEvidence(
  db: Db,
  p: { firmId: string; caseId: string; column: string },
  proposal: EvidenceProposal,
  base: Base
): Promise<EvidenceView> {
  const start = proposal.window_start ?? ''
  const end = proposal.window_end ?? ''
  const months = start && end ? windowMonths(start, end) : []
  const { ids } = await bankScope(db, p.firmId, p.caseId)
  const subtotals = new Map<string, number>()
  const txns: BankTxn[] = []
  let truncated = false
  if (ids.length > 0 && months.length > 0) {
    for (const r of await monthlyRows(db, p, start, end)) {
      if (r.canonical_column !== p.column || (r.treatment !== 'income' && r.treatment !== 'expense')) continue
      const key = String(r.month).slice(0, 10)
      subtotals.set(key, (subtotals.get(key) ?? 0) + Number(r.amount_cents))
    }
    // Categories come from plaid_category_map rows (data, never literals here).
    const map = await db.from('plaid_category_map').select('pfc_detailed, treatment').eq('canonical_column', p.column).in('treatment', ['income', 'expense'])
    if (map.error) throw new Error('category_map_failed')
    const accounts = await db.from('bank_accounts').select('id, name, mask').in('connection_id', ids)
    if (accounts.error) throw new Error('bank_lookup_failed')
    const labelOf = new Map((accounts.data as Array<{ id: string; name: string | null; mask: string | null }>).map((a) => [a.id, `${a.name ?? 'Account'} ••${a.mask ?? '????'}`]))
    for (const treatment of ['income', 'expense'] as const) {
      const cats = (map.data as Array<{ pfc_detailed: string; treatment: string }>).filter((m) => m.treatment === treatment).map((m) => m.pfc_detailed)
      if (cats.length === 0) continue
      // Plaid sign: negative = money in. The same sign rule as financial_bank_monthly, so rows match its subtotals.
      let q = db
        .from('bank_transactions')
        .select('id, date, name, merchant_name, amount, bank_account_id')
        .in('connection_id', ids)
        .in('category_detailed', cats)
        .eq('pending', false)
        .gte('date', start)
        .lte('date', end)
      q = treatment === 'income' ? q.lt('amount', 0) : q.gt('amount', 0)
      const res = await q.order('date', { ascending: false }).order('id').limit(MAX_TRANSACTIONS + 1)
      if (res.error) throw new Error('bank_lookup_failed')
      for (const t of res.data as Array<{ id: string; date: string; name: string | null; merchant_name: string | null; amount: number | string; bank_account_id: string }>) {
        const cents = Math.round(num(t.amount) * 100)
        txns.push({
          id: t.id,
          date: t.date,
          name: t.name,
          merchant_name: t.merchant_name,
          amount: (treatment === 'income' ? -cents : cents) / 100,
          account: labelOf.get(t.bank_account_id) ?? 'Account',
        })
      }
    }
    txns.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
    truncated = txns.length > MAX_TRANSACTIONS
    txns.length = Math.min(txns.length, MAX_TRANSACTIONS)
  }
  return {
    ...base,
    kind: 'bank',
    window: { start, end, months: months.length },
    months: months.map((month) => ({
      month,
      subtotal: (subtotals.get(month) ?? 0) / 100,
      transactions: txns.filter((t) => t.date.slice(0, 7) === month.slice(0, 7)),
    })),
    average: num(proposal.proposed_value),
    truncated,
    cross_check: null,
  }
}
