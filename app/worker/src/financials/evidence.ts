// The evidence behind one 433-A figure (D-10, FORM-03): what a proposal was computed from.
// Every read is scoped by firm and case. Bank subtotals come from SQL; the payroll formula repeats the proposer's math per employer.
import { QUESTION_BY_ID } from '../../../shared/questions'
import { createAdminClient } from '../db/client'
import { safeName, signedReadUrl } from '../storage/case-documents'
import { staffDisplayNames } from './db'
import { labelFor } from './lines'
import { centsToNumber, divHalfUp, toCents } from './propose/cents'
import { payFrequencyAnswer, periodsPerYear } from './propose/payroll'

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
  | (Base & {
      kind: 'balances'
      accounts: Array<{ id: string; account: string; type: string | null; subtype: string | null; balance_current: number | null; balance_as_of: string | null }>
      total: number
    })
  | (Base & {
      kind: 'payroll'
      window: { start: string; end: string }
      stubs: Array<{ employer: string | null; pay_date: string; gross: number | null; frequency: string | null; document_url: string | null }>
      formula: Array<{ employer: string | null; sum: number; stubs: number; periods_per_year: number; monthly: number }>
      method: string
      value: unknown
      cross_check: CrossCheck
    })
  | (Base & { kind: 'intake'; prompt: string; answer: unknown; answered_at: string })
  | (Base & { kind: 'logics'; field: string; value: unknown; fetched_at: string })
  | (Base & {
      kind: 'address'
      address: { line1: string | null; line2: string | null; city: string | null; state_code: string | null; zip5: string | null }
      county: string | null
      fips: string | null
      source: string | null
    })
  | (Base & { kind: 'staff'; by_name: string | null; at: string | null; note: string | null; value: unknown })
  | (Base & { kind: 'document'; documents: Array<{ id: string; name: string; url: string | null }> })
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
export const SIGNED_URL_SECONDS = 300 // Phase 3 D-05, T-07-42
export const CROSS_CHECK_LABEL = 'Plaid salary deposits (net, cross-check only)'
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v))
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : num(v))
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
type Obj = Record<string, unknown>
const objects = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter((x): x is Obj => !!x && typeof x === 'object') : [])
const isWageColumn = (column: string) => column.startsWith('gross_wages_')

// Pure: which evidence a proposal opens to.
export function evidenceKind(p: Pick<EvidenceProposal, 'source' | 'canonical_column'>): EvidenceView['kind'] {
  switch (p.source) {
    case 'plaid':
      return p.canonical_column === 'cash_and_bank_balances' ? 'balances' : 'bank'
    case 'truv':
      return 'payroll'
    case 'intake':
    case 'logics':
    case 'address':
    case 'staff':
    case 'document':
      return p.source
    default:
      return 'none'
  }
}

export type PayStubRef = { connection_id: string; employer_id: string; pay_date: string; check_number: string | null }

// Pure: `<connection_id>:<employer_id>:<pay_date>[:<check_number>]` (propose/payroll.ts); anything else is null.
export function parsePayStubRef(id: string): PayStubRef | null {
  const parts = id.split(':')
  if (parts.length !== 3 && parts.length !== 4) return null
  const [connection_id, employer_id, pay_date, check_number = null] = parts
  if (!connection_id || !employer_id || check_number === '' || !/^\d{4}-\d{2}-\d{2}$/.test(pay_date)) return null
  return { connection_id, employer_id, pay_date, check_number }
}

// Pure: the end of a stored stub's key, .../payroll/<company>-<employer_id>/paystub-<pay_date>[-<check>].pdf
// (storage/connection-files.ts employerSlug + integrations/truv/reports.ts collectEmployerFiles).
export const payStubKeySuffix = (r: PayStubRef) =>
  `-${safeName(r.employer_id)}/paystub-${safeName(r.pay_date)}${r.check_number ? `-${safeName(r.check_number)}` : ''}.pdf`

// Pure: net salary deposits as a monthly figure for a wage column; never a wage proposal (D-09).
export function crossCheckFrom(rows: MonthlyRow[], column: string, months: number): CrossCheck {
  if (!isWageColumn(column) || months <= 0) return null
  const hits = rows.filter((r) => r.treatment === 'informational' && r.canonical_column === column)
  if (hits.length === 0) return null
  const cents = hits.reduce((sum, r) => sum + Number(r.amount_cents), 0)
  return { label: CROSS_CHECK_LABEL, monthly: centsToNumber(divHalfUp(cents, months)) }
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
// `actor` is the signed-in staff member, named from the session like GET financials does.
export async function buildEvidence(
  env: DbEnv,
  p: { firmId: string; caseId: string; column: string; proposalId: string | null; actor?: { id: string; name: string } }
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
    case 'balances':
      return balancesEvidence(db, p, proposal, base)
    case 'payroll':
      return payrollEvidence(env, db, p, proposal, base)
    case 'intake':
      return { ...base, kind: 'intake', prompt: QUESTION_BY_ID[p.column]?.prompt ?? label, answer: proposal.proposed_value, answered_at: proposal.created_at }
    case 'logics': {
      const field = proposal.source_refs.find((r) => r.kind === 'logics_field')?.id ?? proposal.method
      return { ...base, kind: 'logics', field, value: proposal.proposed_value, fetched_at: proposal.created_at }
    }
    case 'address':
      return addressEvidence(db, p, proposal, base)
    case 'staff': {
      const by = proposal.decided_by
      const names = by && by === p.actor?.id ? { [by]: p.actor.name } : by ? await staffDisplayNames(env, p.firmId, [by]) : {}
      return {
        ...base,
        kind: 'staff',
        by_name: by ? (names[by] ?? null) : null,
        at: proposal.decided_at,
        note: proposal.decision_note,
        value: proposal.decided_value ?? proposal.proposed_value,
      }
    }
    case 'document':
      return { ...base, kind: 'document', documents: await signedDocuments(env, db, p.caseId, proposal.source_refs.map((r) => r.id)) }
    default:
      return { kind: 'none', column: p.column, label }
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const sign = (env: DbEnv, key: string) => signedReadUrl(env, key, { expiresIn: 300 })

// Case-scoped documents by id, each with a 300-second signed URL; storage keys never leave here (T-07-42).
async function signedDocuments(env: DbEnv, db: Db, caseId: string, ids: string[]) {
  const uuids = ids.filter((id) => UUID.test(id))
  if (uuids.length === 0) return []
  const res = await db.from('documents').select('id, original_filename, storage_key').eq('case_id', caseId).in('id', uuids)
  if (res.error) throw new Error('document_lookup_failed')
  const rows = res.data as Array<{ id: string; original_filename: string | null; storage_key: string }>
  return Promise.all(rows.map(async (d) => ({ id: d.id, name: d.original_filename ?? 'Document', url: await sign(env, d.storage_key) })))
}

async function balancesEvidence(db: Db, p: { firmId: string; caseId: string }, proposal: EvidenceProposal, base: Base): Promise<EvidenceView> {
  const { ids } = await bankScope(db, p.firmId, p.caseId)
  const wanted = proposal.source_refs.filter((r) => r.kind === 'bank_account' && UUID.test(r.id)).map((r) => r.id)
  let accounts: Extract<EvidenceView, { kind: 'balances' }>['accounts'] = []
  if (ids.length > 0 && wanted.length > 0) {
    // Only the case's own accounts: a ref id from elsewhere matches nothing (T-07-43).
    const res = await db
      .from('bank_accounts')
      .select('id, name, mask, type, subtype, balance_current, balance_as_of')
      .in('connection_id', ids)
      .in('id', wanted)
      .order('id')
    if (res.error) throw new Error('bank_lookup_failed')
    accounts = (res.data as Obj[]).map((a) => ({
      id: a.id as string,
      account: `${text(a.name) ?? 'Account'} ••${text(a.mask) ?? '????'}`,
      type: text(a.type),
      subtype: text(a.subtype),
      balance_current: numOrNull(a.balance_current),
      balance_as_of: text(a.balance_as_of),
    }))
  }
  return { ...base, kind: 'balances', accounts, total: num(proposal.proposed_value) }
}

async function addressEvidence(db: Db, p: { firmId: string; caseId: string; column: string }, proposal: EvidenceProposal, base: Base): Promise<EvidenceView> {
  const res = await db
    .from('cases')
    .select('address_line1, address_line2, city, state_code, zip5, county_name, county_fips')
    .eq('firm_id', p.firmId)
    .eq('id', p.caseId)
    .single()
  if (res.error) throw new Error('case_lookup_failed')
  const row = res.data as Obj
  const ref = proposal.source_refs[0] ?? null
  // A Logics-address fallback is never stored (Phase 2 C8/M6), so only its FIPS (from the ref) is shown.
  const fromCase = ref?.kind === 'address'
  const pick = (key: string) => (fromCase ? text(row[key]) : null)
  return {
    ...base,
    kind: 'address',
    address: { line1: pick('address_line1'), line2: pick('address_line2'), city: pick('city'), state_code: pick('state_code'), zip5: pick('zip5') },
    county: p.column === 'county_of_residence' ? String(proposal.proposed_value) : pick('county_name'),
    fips: /FIPS (\d{5})/.exec(ref?.label ?? '')?.[1] ?? pick('county_fips'),
    source: ref?.label ?? null,
  }
}

export type Stub = { ref: PayStubRef; employer: string | null; gross_cents: number | null; code: string | null }

// Pure: the stub a ref points at in the connection's stored income report (same match as propose/payroll.ts).
export function findStub(data: Obj | null, ref: PayStubRef): Stub {
  for (const e of objects(data?.employers)) {
    if (String(e.employer_id ?? '') !== ref.employer_id || !e.report || typeof e.report !== 'object') continue
    for (const emp of objects((e.report as Obj).employments)) {
      for (const s of objects(emp.statements)) {
        if (typeof s.pay_date !== 'string' || s.pay_date.slice(0, 10) !== ref.pay_date || text(s.check_number) !== ref.check_number) continue
        let gross: number | null
        try {
          gross = toCents(s.gross_pay as string)
        } catch {
          gross = null // shown as missing, never guessed
        }
        const employer = text((emp.company as Obj | undefined)?.name) ?? text(e.company_name)
        return { ref, employer, gross_cents: gross, code: text(emp.pay_frequency) }
      }
    }
  }
  return { ref, employer: null, gross_cents: null, code: null }
}

// Pure: per employer, the gross sum, stub count, periods per year and monthly figure (the proposer's half-up math).
export function payrollFormula(stubs: Stub[]) {
  const groups = new Map<string, { employer: string | null; sum: number; stubs: number; periods_per_year: number }>()
  for (const s of stubs) {
    const periods = periodsPerYear(s.code)
    if (s.gross_cents === null || !periods) continue
    const key = `${s.ref.connection_id}:${s.ref.employer_id}`
    const g = groups.get(key) ?? { employer: s.employer, sum: 0, stubs: 0, periods_per_year: periods }
    groups.set(key, { ...g, sum: g.sum + s.gross_cents, stubs: g.stubs + 1 })
  }
  return [...groups.values()].map((g) => ({
    employer: g.employer,
    sum: centsToNumber(g.sum),
    stubs: g.stubs,
    periods_per_year: g.periods_per_year,
    monthly: centsToNumber(divHalfUp(g.sum * g.periods_per_year, g.stubs * 12)),
  }))
}

async function payrollEvidence(
  env: DbEnv,
  db: Db,
  p: { firmId: string; caseId: string; column: string },
  proposal: EvidenceProposal,
  base: Base
): Promise<EvidenceView> {
  const refs = proposal.source_refs.flatMap((r) => {
    const parsed = r.kind === 'pay_stub' ? parsePayStubRef(r.id) : null
    return parsed && UUID.test(parsed.connection_id) ? [parsed] : []
  })
  const connIds = [...new Set(refs.map((r) => r.connection_id))]
  let conns: Array<{ id: string; data: Obj | null }> = []
  let docs: Array<{ connection_id: string; storage_key: string }> = []
  if (connIds.length > 0) {
    // Firm, case and kind scope the connections; documents are read only for those (T-07-43).
    const c = await db.from('connections').select('id, data').eq('firm_id', p.firmId).eq('case_id', p.caseId).eq('kind', 'payroll').in('id', connIds)
    if (c.error) throw new Error('payroll_lookup_failed')
    conns = c.data as typeof conns
    if (conns.length > 0) {
      const d = await db
        .from('documents')
        .select('connection_id, storage_key')
        .eq('case_id', p.caseId)
        .eq('document_type', 'pay_stub')
        .in('connection_id', conns.map((x) => x.id))
      if (d.error) throw new Error('document_lookup_failed')
      docs = d.data as typeof docs
    }
  }
  const stubs = refs.map((r) => findStub(conns.find((c) => c.id === r.connection_id)?.data ?? null, r))
  const rows = await Promise.all(
    stubs.map(async (s) => {
      const doc = docs.find((d) => d.connection_id === s.ref.connection_id && d.storage_key.endsWith(payStubKeySuffix(s.ref)))
      return {
        employer: s.employer,
        pay_date: s.ref.pay_date,
        gross: s.gross_cents === null ? null : centsToNumber(s.gross_cents),
        frequency: payFrequencyAnswer(s.code) ?? s.code,
        document_url: doc ? await sign(env, doc.storage_key) : null,
      }
    })
  )
  const start = proposal.window_start ?? ''
  const end = proposal.window_end ?? ''
  const months = start && end ? windowMonths(start, end).length : 0
  const crossCheck = isWageColumn(p.column) && months > 0 ? crossCheckFrom(await monthlyRows(db, p, start, end), p.column, months) : null
  return {
    ...base,
    kind: 'payroll',
    window: { start, end },
    stubs: rows.sort((a, b) => b.pay_date.localeCompare(a.pay_date)),
    // The arithmetic explains wage lines only; deduction lines show their stubs and method.
    formula: proposal.method === 'mean_gross_pay_x_periods_div_12' ? payrollFormula(stubs) : [],
    method: proposal.method,
    value: proposal.proposed_value,
    cross_check: crossCheck,
  }
}

// The case's bank connections (same filter as financial_bank_monthly) and their account labels.
async function bankScope(db: Db, firmId: string, caseId: string) {
  const conns = await db.from('connections').select('id').eq('firm_id', firmId).eq('case_id', caseId).eq('kind', 'bank').neq('status', 'removed')
  if (conns.error) throw new Error('bank_lookup_failed')
  const ids = (conns.data as Array<{ id: string }>).map((c) => c.id)
  return { ids }
}

export interface MonthlyRow {
  canonical_column: string
  treatment: string
  month: string
  amount_cents: number | string
  txn_count: number
}

async function monthlyRows(db: Db, p: { firmId: string; caseId: string }, start: string, end: string) {
  const res = await db.rpc('financial_bank_monthly', { p_firm_id: p.firmId, p_case_id: p.caseId, p_window_start: start, p_window_end: end })
  if (res.error) throw new Error('bank_monthly_failed')
  return res.data as MonthlyRow[]
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
  let crossCheck: CrossCheck = null
  if (ids.length > 0 && months.length > 0) {
    const rows = await monthlyRows(db, p, start, end)
    crossCheck = crossCheckFrom(rows, p.column, months.length)
    for (const r of rows) {
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
    cross_check: crossCheck,
  }
}
