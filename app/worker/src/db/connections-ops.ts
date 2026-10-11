import { targetMonths } from '../../../src/lib/statement-months'
import { PROVIDER_CAPABILITIES, type BankCapabilities } from '../integrations/bank/provider'
import { createAdminClient } from './client'
import { latestConnectionForItem, type ConnectionRow, type ConnectionStatus, type ProviderId } from './connections'

type DbEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>

const MINUTE = 60_000
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
const ids = (rows: unknown) => ((rows ?? []) as Array<{ id: string }>).map((r) => r.id)

// --- Cron queries (D-04, D-13) ---

// Non-terminal connections with no webhook, poll or creation in the last `olderThanMinutes`,
// younger than 14 days (Truv order expiry), least recently polled first.
export async function listStaleConnections(env: DbEnv, olderThanMinutes = 10, limit = 50): Promise<string[]> {
  const cutoff = ago(olderThanMinutes * MINUTE)
  const { data, error } = await createAdminClient(env)
    .from('connections')
    .select('id')
    .in('status', ['pending', 'connected', 'syncing'])
    .or(`last_webhook_at.is.null,last_webhook_at.lt.${cutoff}`)
    .or(`last_polled_at.is.null,last_polled_at.lt.${cutoff}`)
    .lt('created_at', cutoff)
    .gt('created_at', ago(14 * 24 * 60 * MINUTE))
    .order('last_polled_at', { ascending: true, nullsFirst: true })
    .limit(limit)
  if (error) throw new Error('connection_list_failed')
  return ids(data)
}

// Ledger rows still 'queued' after 2 minutes: a crash between insert and JOBS.send.
export async function listStuckWebhookEvents(
  env: DbEnv,
  olderThanMinutes = 2,
  limit = 50
): Promise<Array<{ id: string; provider: 'plaid' | 'truv' }>> {
  const { data, error } = await createAdminClient(env)
    .from('webhook_events')
    .select('id, provider')
    .eq('status', 'queued')
    .in('provider', ['plaid', 'truv'])
    .lt('received_at', ago(olderThanMinutes * MINUTE))
    .order('received_at', { ascending: true })
    .limit(limit)
  if (error) throw new Error('webhook_list_failed')
  return (data ?? []) as Array<{ id: string; provider: 'plaid' | 'truv' }>
}

// Pending bank connections older than `hours` that never got an access token: the Hosted Link
// session (6 h) is gone. The secret's absence is filtered here, not in SQL (no schema change).
export async function expireStalePendingBank(env: DbEnv, hours = 6): Promise<string[]> {
  const { data, error } = await createAdminClient(env)
    .from('connections')
    .select('id, connection_secrets(connection_id)')
    .eq('kind', 'bank')
    .eq('status', 'pending')
    .lt('created_at', ago(hours * 60 * MINUTE))
    .limit(100)
  if (error) throw new Error('connection_list_failed')
  const rows = (data ?? []) as Array<{ id: string; connection_secrets: unknown }>
  // one-to-one embed: PostgREST returns an object or null (an array on older schema caches)
  const hasSecret = (s: unknown) => (Array.isArray(s) ? s.length > 0 : s !== null && s !== undefined)
  return rows.filter((r) => !hasSecret(r.connection_secrets)).map((r) => r.id)
}

// BANK-06: Plaid Items past remove_after that still hold an access token, oldest first.
export async function listRemovalCandidates(env: DbEnv, limit = 20): Promise<string[]> {
  const { data, error } = await createAdminClient(env)
    .from('connections')
    .select('id, connection_secrets!inner(connection_id)')
    .eq('provider', 'plaid')
    .is('removed_at', null)
    .lte('remove_after', new Date().toISOString())
    .order('remove_after', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit)
  if (error) throw new Error('connection_list_failed')
  return ids(data)
}

// --- Staff read model (D-10, PAY-04, BANK-03) ---

export type MonthStatus = 'pending' | 'available' | 'not_supported' | 'manual' | 'missing'
export type UpdateStatus = 'not_ready' | 'initial' | 'historical'

export interface MonthCell {
  year: number
  month: number
  status: MonthStatus
  document_id: string | null
}

export interface AccountSummary {
  id: string
  external_account_id: string
  mask: string | null
  name: string | null
  type: string | null
  subtype: string | null
  months: MonthCell[]
}

export interface EmployerView {
  employer_id: string
  company_name: string | null
  status: 'pending' | 'connected' | 'done' | 'error'
  pay_stubs: number
  w2s: number
  income_reports: number
  documents: Array<{ id: string; document_type: string; name: string }>
}

export interface ConnectionSummary {
  id: string
  request_item_id: string
  kind: 'bank' | 'payroll'
  provider: ProviderId
  status: ConnectionStatus
  error: { code: string; message?: string } | null
  created_at: string
  connected_at: string | null
  completed_at: string | null
  last_webhook_at: string | null
  last_polled_at: string | null
  remove_after: string | null
  capabilities: BankCapabilities | null
  accounts: AccountSummary[]
  transactions: { count: number; update_status: UpdateStatus | null }
  employers: EmployerView[]
}

export interface TransactionRow {
  id: string
  bank_account_id: string | null
  date: string
  authorized_date: string | null
  name: string | null
  merchant_name: string | null
  amount: number
  iso_currency_code: string | null
  category_primary: string | null
  category_detailed: string | null
  pending: boolean
}

// Rows the projection reads, as the queries in getConnectionSummary return them.
export interface SummaryParts {
  accounts: Array<
    Omit<AccountSummary, 'months'> & {
      bank_statement_months: Array<{ year: number; month: number; status: MonthStatus; document_id: string | null }>
    }
  >
  transactionCount: number
  documents: Array<{ id: string; document_type: string | null; original_filename: string; storage_key: string }>
}

// Plaid's raw values (Plan 04 may store either form).
const UPDATE_STATUS: Record<string, UpdateStatus> = {
  HISTORICAL_UPDATE_COMPLETE: 'historical',
  INITIAL_UPDATE_COMPLETE: 'initial',
  NOT_READY: 'not_ready',
  historical: 'historical',
  initial: 'initial',
  not_ready: 'not_ready',
}
const EMPLOYER_STATUS = new Set(['pending', 'connected', 'done', 'error'])
const str = (v: unknown) => (typeof v === 'string' ? v : null)
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const byMaskThenId = (a: { mask: string | null; id: string }, b: { mask: string | null; id: string }) => {
  if (a.mask === b.mask) return cmp(a.id, b.id)
  if (a.mask === null) return 1
  if (b.mask === null) return -1
  return cmp(a.mask, b.mask)
}
// Payroll files live under .../payroll/<company-slug>-<employer_id>/<name> (Plan 04-03 employerSlug).
const payrollGroup = (key: string) => key.split('/payroll/')[1]?.split('/')[0] ?? null

function employerViews(data: Record<string, unknown>, documents: SummaryParts['documents']): EmployerView[] {
  const raw = Array.isArray(data.employers) ? (data.employers as Array<Record<string, unknown>>) : []
  return raw
    .filter((e) => typeof e?.employer_id === 'string')
    .map((e) => {
      const id = e.employer_id as string
      const docs = documents.filter((d) => payrollGroup(d.storage_key)?.endsWith(`-${id}`))
      const count = (type: string) => docs.filter((d) => d.document_type === type).length
      return {
        employer_id: id,
        company_name: str(e.company_name),
        status: EMPLOYER_STATUS.has(e.status as string) ? (e.status as EmployerView['status']) : 'pending',
        pay_stubs: count('pay_stub'),
        w2s: count('w2'),
        income_reports: count('income_report'),
        documents: docs.map((d) => ({ id: d.id, document_type: d.document_type ?? 'other', name: d.original_filename })),
      }
    })
}

// Built from an explicit field list: link_ref, return_nonce, sync_cursor, external_id never leave.
export function projectSummary(conn: ConnectionRow, parts: SummaryParts, now = new Date()): ConnectionSummary {
  const window = targetMonths(now)
  const code = str(conn.error?.code)
  const message = str(conn.error?.message)
  return {
    id: conn.id,
    request_item_id: conn.request_item_id,
    kind: conn.kind,
    provider: conn.provider,
    status: conn.status,
    error: code ? { code, ...(message ? { message } : {}) } : null,
    created_at: conn.created_at,
    connected_at: conn.connected_at,
    completed_at: conn.completed_at,
    last_webhook_at: conn.last_webhook_at,
    last_polled_at: conn.last_polled_at,
    remove_after: conn.remove_after,
    capabilities: PROVIDER_CAPABILITIES[conn.provider],
    accounts: [...parts.accounts].sort(byMaskThenId).map((a) => ({
      id: a.id,
      external_account_id: a.external_account_id,
      mask: a.mask,
      name: a.name,
      type: a.type,
      subtype: a.subtype,
      months: window.map(({ year, month }) => {
        const cell = a.bank_statement_months.find((m) => m.year === year && m.month === month)
        return { year, month, status: cell?.status ?? 'missing', document_id: cell?.document_id ?? null }
      }),
    })),
    transactions: {
      count: parts.transactionCount,
      update_status: UPDATE_STATUS[str(conn.data.transactions_update_status) ?? ''] ?? null,
    },
    employers: employerViews(conn.data, parts.documents),
  }
}

export async function getConnectionSummary(env: DbEnv, conn: ConnectionRow, now = new Date()): Promise<ConnectionSummary> {
  const db = createAdminClient(env)
  const [accounts, transactions, documents] = await Promise.all([
    db
      .from('bank_accounts')
      .select('id, external_account_id, mask, name, type, subtype, bank_statement_months(year, month, status, document_id)')
      .eq('connection_id', conn.id),
    db.from('bank_transactions').select('id', { count: 'exact', head: true }).eq('connection_id', conn.id),
    db
      .from('documents')
      .select('id, document_type, original_filename, storage_key')
      .eq('connection_id', conn.id)
      .eq('status', 'ready')
      .order('uploaded_at', { ascending: true })
      .order('id', { ascending: true }),
  ])
  if (accounts.error || transactions.error || documents.error) throw new Error('connection_summary_failed')
  return projectSummary(
    conn,
    {
      accounts: (accounts.data ?? []) as SummaryParts['accounts'],
      transactionCount: transactions.count ?? 0,
      documents: (documents.data ?? []) as SummaryParts['documents'],
    },
    now
  )
}

// Firm-scoped in SQL (T-04-07): another firm's request reads as absent.
export async function firmOwnsRequest(env: DbEnv, firmId: string, requestId: string): Promise<boolean> {
  const { data, error } = await createAdminClient(env)
    .from('requests')
    .select('id')
    .eq('id', requestId)
    .eq('firm_id', firmId)
    .maybeSingle()
  if (error) throw new Error('request_lookup_failed')
  return data !== null
}

export async function listRequestConnections(env: DbEnv, firmId: string, requestId: string): Promise<ConnectionSummary[]> {
  const { data, error } = await createAdminClient(env)
    .from('connections')
    .select('*')
    .eq('request_id', requestId)
    .eq('firm_id', firmId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
  if (error) throw new Error('connection_list_failed')
  return Promise.all(((data ?? []) as ConnectionRow[]).map((c) => getConnectionSummary(env, c)))
}

export async function latestItemSummary(env: DbEnv, requestItemId: string): Promise<ConnectionSummary | null> {
  const conn = await latestConnectionForItem(env, requestItemId)
  return conn ? getConnectionSummary(env, conn) : null
}

// Firm-scoped in SQL (T-04-07): another firm's connection reads as null.
export async function getFirmConnection(env: DbEnv, firmId: string, connectionId: string): Promise<ConnectionRow | null> {
  const { data, error } = await createAdminClient(env)
    .from('connections')
    .select('*')
    .eq('id', connectionId)
    .eq('firm_id', firmId)
    .maybeSingle()
  if (error) throw new Error('connection_lookup_failed')
  return (data as ConnectionRow | null) ?? null
}

const TRANSACTION_COLUMNS =
  'id, bank_account_id, date, authorized_date, name, merchant_name, amount, iso_currency_code, category_primary, category_detailed, pending'

// First day of the month `months` before now (UTC), as a DATE literal.
export const windowStart = (now: Date, months: number) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1)).toISOString().slice(0, 10)

// null when the connection is not the firm's (uniform not-found). Stable order on equal dates.
export async function listConnectionTransactions(
  env: DbEnv,
  firmId: string,
  connectionId: string,
  months: 3 | 6,
  limit = 1000,
  now = new Date()
): Promise<{ rows: TransactionRow[]; total: number } | null> {
  if (!(await getFirmConnection(env, firmId, connectionId))) return null
  const { data, error, count } = await createAdminClient(env)
    .from('bank_transactions')
    .select(TRANSACTION_COLUMNS, { count: 'exact' })
    .eq('connection_id', connectionId)
    .gte('date', windowStart(now, months))
    .order('date', { ascending: false })
    .order('plaid_transaction_id', { ascending: true })
    .limit(limit)
  if (error) throw new Error('transaction_list_failed')
  const rows = ((data ?? []) as TransactionRow[]).map((r) => ({ ...r, amount: Number(r.amount) }))
  return { rows, total: count ?? rows.length }
}
