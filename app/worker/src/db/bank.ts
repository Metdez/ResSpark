import type { NormAccount, NormBalance, NormTransaction } from '../integrations/bank/provider'
import { createAdminClient } from './client'

type DbEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>

// Single-use: the conditional UPDATE is atomic, so two concurrent returns cannot both win.
export async function consumeReturnNonce(env: DbEnv, nonce: string): Promise<string | null> {
  const { data, error } = await createAdminClient(env)
    .from('connections')
    .update({ return_nonce_used_at: new Date().toISOString() })
    .eq('return_nonce', nonce)
    .is('return_nonce_used_at', null)
    .select('id')
    .maybeSingle()
  if (error) throw new Error('nonce_consume_failed')
  return (data as { id: string } | null)?.id ?? null
}

export async function findConnectionAccount(env: DbEnv, connectionId: string, accountId: string): Promise<{ id: string } | null> {
  const { data, error } = await createAdminClient(env)
    .from('bank_accounts')
    .select('id')
    .eq('connection_id', connectionId)
    .eq('id', accountId)
    .maybeSingle()
  if (error) throw new Error('account_lookup_failed')
  return (data as { id: string } | null) ?? null
}

export type CellStatus = 'pending' | 'available' | 'not_supported' | 'manual' | 'missing'
export interface AccountCell {
  year: number
  month: number
  status: CellStatus
  document_id: string | null
}

// Returns external_account_id -> bank_accounts.id.
export async function upsertAccounts(env: DbEnv, connectionId: string, accounts: NormAccount[]): Promise<Record<string, string>> {
  if (accounts.length === 0) return {}
  const { data, error } = await createAdminClient(env)
    .from('bank_accounts')
    .upsert(
      // explicit columns: statement listings carry extra fields
      accounts.map((a) => ({
        connection_id: connectionId,
        external_account_id: a.external_account_id,
        mask: a.mask,
        name: a.name,
        official_name: a.official_name,
        type: a.type,
        subtype: a.subtype,
      })),
      { onConflict: 'connection_id,external_account_id' }
    )
    .select('id, external_account_id')
  if (error) throw new Error('account_upsert_failed')
  return Object.fromEntries((data as Array<{ id: string; external_account_id: string }>).map((r) => [r.external_account_id, r.id]))
}

// One update per account (a connection has a handful); unknown accounts are ignored. Returns rows updated.
export async function updateAccountBalances(env: DbEnv, connectionId: string, balances: NormBalance[]): Promise<number> {
  let updated = 0
  for (const b of balances) {
    const { data, error } = await createAdminClient(env)
      .from('bank_accounts')
      .update({ balance_current: b.current, balance_available: b.available, balance_as_of: b.as_of })
      .eq('connection_id', connectionId)
      .eq('external_account_id', b.external_account_id)
      .select('id')
    if (error) throw new Error('balance_update_failed')
    updated += data.length
  }
  return updated
}

export async function listConnectionAccounts(env: DbEnv, connectionId: string): Promise<Array<{ id: string }>> {
  const { data, error } = await createAdminClient(env).from('bank_accounts').select('id').eq('connection_id', connectionId)
  if (error) throw new Error('account_lookup_failed')
  return (data ?? []) as Array<{ id: string }>
}

export interface AccountRow {
  id: string
  external_account_id: string
  mask: string | null
  name: string | null
}

// The accounts with the fields a generated transaction statement is named by (mask, name).
export async function listConnectionAccountRows(env: DbEnv, connectionId: string): Promise<AccountRow[]> {
  const { data, error } = await createAdminClient(env)
    .from('bank_accounts')
    .select('id, external_account_id, mask, name')
    .eq('connection_id', connectionId)
    .order('mask')
    .order('id')
  if (error) throw new Error('account_lookup_failed')
  return (data ?? []) as AccountRow[]
}

export interface MonthTransaction {
  date: string
  name: string | null
  merchant_name: string | null
  amount: number
  pending: boolean
}

const pad2 = (n: number) => String(n).padStart(2, '0')

// One account's transactions dated inside the month, first to last day inclusive, in feed order.
export async function listAccountMonthTransactions(env: DbEnv, accountId: string, year: number, month: number): Promise<MonthTransaction[]> {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const { data, error } = await createAdminClient(env)
    .from('bank_transactions')
    .select('date, name, merchant_name, amount, pending')
    .eq('bank_account_id', accountId)
    .gte('date', `${year}-${pad2(month)}-01`)
    .lte('date', `${year}-${pad2(month)}-${pad2(lastDay)}`)
    .order('date')
    .order('plaid_transaction_id')
  if (error) throw new Error('transaction_lookup_failed')
  // NUMERIC arrives as a string from PostgREST.
  return ((data ?? []) as Array<Omit<MonthTransaction, 'amount'> & { amount: unknown }>).map((r) => ({ ...r, amount: Number(r.amount) }))
}

export async function ensureMonthCells(env: DbEnv, accountIds: string[], cells: Array<{ year: number; month: number }>): Promise<void> {
  const rows = accountIds.flatMap((bank_account_id) => cells.map((c) => ({ bank_account_id, ...c, status: 'pending' })))
  if (rows.length === 0) return
  const { error } = await createAdminClient(env)
    .from('bank_statement_months')
    .upsert(rows, { onConflict: 'bank_account_id,year,month', ignoreDuplicates: true })
  if (error) throw new Error('cell_insert_failed')
}

export async function setMonthCell(
  env: DbEnv,
  accountId: string,
  year: number,
  month: number,
  status: CellStatus,
  documentId: string | null = null
): Promise<void> {
  const { error } = await createAdminClient(env)
    .from('bank_statement_months')
    .upsert(
      { bank_account_id: accountId, year, month, status, document_id: documentId, updated_at: new Date().toISOString() },
      { onConflict: 'bank_account_id,year,month' }
    )
  if (error) throw new Error('cell_update_failed')
}

// `onlyFrom` limits which current statuses may change, so available/manual are never downgraded.
export async function setAccountCells(env: DbEnv, accountId: string, status: CellStatus, onlyFrom?: CellStatus[]): Promise<void> {
  let q = createAdminClient(env)
    .from('bank_statement_months')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('bank_account_id', accountId)
  if (onlyFrom) q = q.in('status', onlyFrom)
  const { error } = await q
  if (error) throw new Error('cell_update_failed')
}

export async function getAccountCells(env: DbEnv, accountId: string): Promise<AccountCell[]> {
  const { data, error } = await createAdminClient(env)
    .from('bank_statement_months')
    .select('year, month, status, document_id')
    .eq('bank_account_id', accountId)
  if (error) throw new Error('cell_lookup_failed')
  return (data ?? []) as AccountCell[]
}

const CHUNK = 500

export async function upsertTransactions(
  env: DbEnv,
  connectionId: string,
  accountIdByExt: Record<string, string>,
  txns: NormTransaction[]
): Promise<number> {
  const now = new Date().toISOString()
  const rows = txns
    .filter((t) => accountIdByExt[t.external_account_id])
    .map(({ external_account_id, ...t }) => ({
      ...t,
      connection_id: connectionId,
      bank_account_id: accountIdByExt[external_account_id],
      updated_at: now,
    }))
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await createAdminClient(env)
      .from('bank_transactions')
      .upsert(rows.slice(i, i + CHUNK), { onConflict: 'plaid_transaction_id' })
    if (error) throw new Error('transaction_upsert_failed')
  }
  return rows.length
}

export async function deleteTransactions(env: DbEnv, plaidTransactionIds: string[]): Promise<void> {
  for (let i = 0; i < plaidTransactionIds.length; i += CHUNK) {
    const { error } = await createAdminClient(env)
      .from('bank_transactions')
      .delete()
      .in('plaid_transaction_id', plaidTransactionIds.slice(i, i + CHUNK))
    if (error) throw new Error('transaction_delete_failed')
  }
}
