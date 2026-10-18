import {
  getSecret,
  insertConnection,
  recordConnectionEvent,
  saveSecret,
  setConnectionStatus,
  updateConnection,
  type ConnectionRow,
  type ConnectionStatus,
} from '../db/connections'
import { deleteTransactions, updateAccountBalances, upsertAccounts, upsertTransactions } from '../db/bank'
import { bankProvider } from '../integrations/bank/index'
import { PERMANENT_ITEM_ERRORS } from '../integrations/bank/plaid/client'
import type { BankProvider } from '../integrations/bank/provider'
import { ProviderError } from '../integrations/provider-error'
import { openToken, sealToken } from '../integrations/token-vault'
import { syncStatements } from './bank-statements'
import { generateTransactionPdfs } from './bank-transaction-pdfs'
import type { ReconcileOpts } from './reconcile'

const DAY_MS = 86_400_000
const removeAfter = (env: Env) => new Date(Date.now() + Number(env.PLAID_REMOVE_AFTER_DAYS || 30) * DAY_MS).toISOString()
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [])

// D-09: only a verified SESSION_FINISHED SUCCESS (or /link/token/get results) connects a bank;
// the access token goes straight into the vault and never into rows, events or messages.
export async function reconcileBank(
  env: Env,
  conn: ConnectionRow,
  opts: ReconcileOpts
): Promise<{ status: ConnectionStatus; applied: boolean }> {
  const provider = bankProvider(env, conn.provider)
  const secret = await getSecret(env, conn.id)
  if (secret) return syncConnected(env, conn, provider, await openToken(env, conn.id, secret), opts)

  const hint = opts.hint
  let publicTokens: string[] | undefined
  if (hint?.webhook_type === 'LINK') {
    if (hint.webhook_code !== 'SESSION_FINISHED') return { status: conn.status, applied: false } // EVENTS: stored, ignored
    if (hint.status !== 'SUCCESS') {
      await recordConnectionEvent(env, conn.id, 'connection.session_exited', { status: String(hint.status ?? '') })
      return { status: conn.status, applied: false }
    }
    publicTokens = strings(hint.public_tokens)
  }
  if (!conn.link_ref) return { status: conn.status, applied: false }
  const results = await provider.completeSession(env, { linkRef: conn.link_ref, publicTokens })
  if (results.length === 0) return { status: conn.status, applied: false }

  const [first, ...rest] = results
  await saveSecret(env, conn.id, await sealToken(env, conn.id, first.accessToken))
  await updateConnection(env, conn.id, {
    external_id: first.externalId,
    data: { ...conn.data, institution_name: first.institutionName },
    remove_after: removeAfter(env),
  })
  const res = await setConnectionStatus(env, conn.id, 'connected', { institution_name: first.institutionName })

  // One Link session can add several Items: each becomes a sibling connection on the same item.
  for (const r of rest) {
    const sibling = await insertConnection(env, {
      firm_id: conn.firm_id,
      request_id: conn.request_id,
      request_item_id: conn.request_item_id,
      case_id: conn.case_id,
      provider: conn.provider,
      kind: 'bank',
      external_id: r.externalId,
      data: { parent_connection_id: conn.id, institution_name: r.institutionName },
    })
    await saveSecret(env, sibling.id, await sealToken(env, sibling.id, r.accessToken))
    await updateConnection(env, sibling.id, { remove_after: removeAfter(env) })
    await setConnectionStatus(env, sibling.id, 'connected', { institution_name: r.institutionName })
    await env.JOBS.send({ type: 'reconcile', ref: sibling.id })
  }
  return { status: res.status, applied: res.applied }
}

const isPermanent = (code: unknown) => (PERMANENT_ITEM_ERRORS as readonly unknown[]).includes(code)

// D-09 / PITFALLS M4: syncing until history is complete AND no month cell is pending, then done.
// Login errors stop with a visible code instead of retrying silently.
async function syncConnected(
  env: Env,
  conn: ConnectionRow,
  provider: BankProvider,
  accessToken: string,
  opts: ReconcileOpts
): Promise<{ status: ConnectionStatus; applied: boolean }> {
  const hint = opts.hint
  let doSync = true
  let doStatements = true
  if (hint?.webhook_type === 'ITEM' && hint.webhook_code === 'ERROR') {
    const err = (hint.error ?? {}) as { error_code?: unknown; error_message?: unknown }
    if (isPermanent(err.error_code)) {
      const res = await setConnectionStatus(env, conn.id, 'error', { code: err.error_code, message: String(err.error_message ?? '') })
      return { status: res.status, applied: res.applied }
    }
  }
  if (hint?.webhook_type === 'ITEM' && hint.webhook_code === 'PENDING_DISCONNECT')
    await recordConnectionEvent(env, conn.id, 'connection.pending_disconnect')
  if (hint?.webhook_type === 'TRANSACTIONS' && hint.webhook_code === 'SYNC_UPDATES_AVAILABLE') doStatements = false
  if (hint?.webhook_type === 'STATEMENTS' && hint.webhook_code === 'STATEMENTS_REFRESH_COMPLETE') doSync = false

  let data = conn.data
  let historical = data.transactions_update_status === 'HISTORICAL_UPDATE_COMPLETE'
  try {
    if (doSync) {
      const r = await provider.syncTransactions(env, accessToken, conn.sync_cursor)
      const ids = await upsertAccounts(env, conn.id, r.accounts)
      await upsertTransactions(env, conn.id, ids, [...r.added, ...r.modified])
      await deleteTransactions(env, r.removed)
      data = { ...data, transactions_update_status: r.statusRaw, last_sync_at: new Date().toISOString() }
      await updateConnection(env, conn.id, { sync_cursor: r.cursor, data })
      historical = r.status === 'historical'
      await syncBalances(env, conn.id, provider, accessToken)
    }
    let pending = 0
    if (doStatements) {
      const requestRefresh = opts.source === 'staff' && data.statements_refresh_requested_at === undefined
      pending = (await syncStatements(env, { ...conn, data }, provider, accessToken, { requestRefresh })).pendingCells
    } else if (conn.status !== 'done') {
      pending = 1 // statements were not checked on this run, so done is not proven
    }
    const complete = historical && pending === 0
    if (complete && provider.capabilities.transactions) await generateTransactionPdfsSafely(env, { ...conn, data })
    const res = await setConnectionStatus(env, conn.id, complete ? 'done' : 'syncing')
    return { status: res.status, applied: res.applied }
  } catch (e) {
    if (e instanceof ProviderError && !e.transient && isPermanent(e.code)) {
      const res = await setConnectionStatus(env, conn.id, 'error', { code: e.code })
      return { status: res.status, applied: res.applied }
    }
    throw e
  }
}

// Oct 12 call (H): months the bank cannot provide get a generated transaction statement once history is
// complete. A failure is recorded and never blocks `done`; the next reconcile tries again.
async function generateTransactionPdfsSafely(env: Env, conn: ConnectionRow): Promise<void> {
  try {
    await generateTransactionPdfs(env, conn)
  } catch (e) {
    await recordConnectionEvent(env, conn.id, 'connection.transaction_pdfs_failed', { code: e instanceof Error ? e.message : 'unknown' })
  }
}

// One /accounts/get per reconcile for cash_and_bank_balances (D-09). Transient and login errors
// propagate (queue retry / error status); any other vendor refusal is recorded and the sync goes on.
async function syncBalances(env: Env, connectionId: string, provider: BankProvider, accessToken: string): Promise<void> {
  if (!provider.accountBalances) return
  try {
    await updateAccountBalances(env, connectionId, await provider.accountBalances(env, accessToken))
  } catch (e) {
    if (!(e instanceof ProviderError) || e.transient || isPermanent(e.code)) throw e
    await recordConnectionEvent(env, connectionId, 'connection.balances_failed', { code: e.code })
  }
}
