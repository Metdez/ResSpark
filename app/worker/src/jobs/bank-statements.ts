import { createHash } from 'node:crypto'
import { isInWindow, targetMonths } from '../../../src/lib/statement-months'
import {
  ensureMonthCells,
  getAccountCells,
  listConnectionAccounts,
  setAccountCells,
  setMonthCell,
  upsertAccounts,
} from '../db/bank'
import { updateConnection, type ConnectionRow } from '../db/connections'
import { statementsWindow } from '../integrations/bank/plaid/link'
import { refreshStatements } from '../integrations/bank/plaid/statements'
import type { BankProvider } from '../integrations/bank/provider'
import { ProviderError } from '../integrations/provider-error'
import { storeProviderFile } from '../storage/connection-files'

const pad2 = (n: number) => String(n).padStart(2, '0')
const toWindow = (now: Date) => {
  const w = statementsWindow(now)
  return { start: w.start_date, end: w.end_date }
}

// D-10 cells: pending -> available | missing | not_supported; manual only via the client route;
// available and manual are never downgraded. Returns the cells still pending.
export async function syncStatements(
  env: Env,
  conn: ConnectionRow,
  provider: BankProvider,
  accessToken: string,
  opts: { requestRefresh: boolean; now?: Date }
): Promise<{ pendingCells: number }> {
  if (!provider.capabilities.statementPdfs) return { pendingCells: 0 }
  const now = opts.now ?? new Date()
  const list = await provider.listStatements(env, accessToken, opts.requestRefresh ? { requestRefresh: toWindow(now) } : undefined)
  if (!list.supported) {
    for (const a of await listConnectionAccounts(env, conn.id)) await setAccountCells(env, a.id, 'not_supported', ['pending', 'missing'])
    return { pendingCells: 0 }
  }
  const ids = await upsertAccounts(env, conn.id, list.accounts)
  await ensureMonthCells(env, Object.values(ids), targetMonths(now, 6))
  if (!list.ready) return { pendingCells: await countPending(env, Object.values(ids)) }

  const refreshedBefore = typeof conn.data.statements_refresh_requested_at === 'string'
  let refreshedNow = false
  for (const account of list.accounts) {
    const accountId = ids[account.external_account_id]
    const inWindow = account.statements.filter((s) => isInWindow({ year: s.year, month: s.month }, now))
    const cells = await getAccountCells(env, accountId)
    const statusOf = (y: number, m: number) => cells.find((c) => c.year === y && c.month === m)?.status
    for (const s of inWindow) {
      if (['available', 'manual'].includes(statusOf(s.year, s.month) ?? '')) continue
      const { document_id } = await storeProviderFile(env, {
        conn,
        kind: 'bank',
        group: account.mask ?? account.external_account_id,
        name: `${s.year}-${pad2(s.month)}.pdf`,
        mime: 'application/pdf',
        document_type: 'bank_statement',
        bytes: async () => {
          const { bytes, sha256 } = await provider.downloadStatement(env, accessToken, s.id)
          const actual = createHash('sha256').update(new Uint8Array(bytes)).digest('hex')
          if (sha256 && actual !== sha256.toLowerCase()) throw new ProviderError('plaid', null, 'statement_hash_mismatch', true)
          return bytes
        },
        actor: 'provider:plaid',
      })
      await setMonthCell(env, accountId, s.year, s.month, 'available', document_id)
    }
    if (inWindow.length > 0) {
      await setAccountCells(env, accountId, 'missing', ['pending'])
    } else if (refreshedBefore) {
      await setAccountCells(env, accountId, 'not_supported', ['pending'])
    } else if (!refreshedNow) {
      // shortcut: one /statements/refresh per connection, ever (cost rule); a monthly top-up is Phase 8.
      await refreshStatements(env, accessToken, toWindow(now))
      await updateConnection(env, conn.id, { data: { ...conn.data, statements_refresh_requested_at: now.toISOString() } })
      refreshedNow = true
    }
  }
  return { pendingCells: await countPending(env, Object.values(ids)) }
}

async function countPending(env: Env, accountIds: string[]): Promise<number> {
  let n = 0
  for (const id of accountIds) n += (await getAccountCells(env, id)).filter((c) => c.status === 'pending').length
  return n
}
