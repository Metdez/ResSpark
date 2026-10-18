// Oct 12 call (H): when the bank provides no statement PDF for a window month, generate a
// "Transaction statement" from the synced feed and attach it to the month cell. The cell keeps its
// status (not_supported / missing), so a real statement upload still wins; the file says it is not official.
import { isInWindow } from '../../../src/lib/statement-months'
import { getAccountCells, listAccountMonthTransactions, listConnectionAccountRows, setMonthCell } from '../db/bank'
import type { ConnectionRow } from '../db/connections'
import { longMonth, renderTransactionStatement } from '../pdf/transactions-statement'
import { storeProviderFile } from '../storage/connection-files'

const pad2 = (n: number) => String(n).padStart(2, '0')
const FALLBACK_STATUSES = ['not_supported', 'missing']

const toArrayBuffer = (u8: Uint8Array): ArrayBuffer => {
  const out = new ArrayBuffer(u8.byteLength)
  new Uint8Array(out).set(u8)
  return out
}

// Idempotent: storeProviderFile keys on the storage path, and a cell that already has a document is skipped.
// shortcut: a generated statement is never rebuilt when later feed updates touch a closed month, upgrade
// when Plaid `modified`/`added` rows for past months matter to the firm.
export async function generateTransactionPdfs(env: Env, conn: ConnectionRow, now = new Date()): Promise<{ generated: number }> {
  let generated = 0
  for (const account of await listConnectionAccountRows(env, conn.id)) {
    for (const cell of await getAccountCells(env, account.id)) {
      if (cell.document_id !== null || !FALLBACK_STATUSES.includes(cell.status) || !isInWindow(cell, now)) continue
      const transactions = (await listAccountMonthTransactions(env, account.id, cell.year, cell.month)).filter((t) => !t.pending)
      if (transactions.length === 0) continue
      const { document_id } = await storeProviderFile(env, {
        conn,
        kind: 'bank',
        group: account.mask ?? account.external_account_id,
        name: `${cell.year}-${pad2(cell.month)}-transactions.pdf`,
        displayName: `Transactions - ${longMonth(cell.year, cell.month)}${account.mask ? ` - x${account.mask}` : ''}.pdf`,
        mime: 'application/pdf',
        document_type: 'bank_transactions',
        bytes: async () =>
          toArrayBuffer(
            await renderTransactionStatement({ accountName: account.name, mask: account.mask, year: cell.year, month: cell.month, transactions })
          ),
        actor: 'provider:resspark',
      })
      await setMonthCell(env, account.id, cell.year, cell.month, cell.status, document_id)
      generated++
    }
  }
  return { generated }
}
