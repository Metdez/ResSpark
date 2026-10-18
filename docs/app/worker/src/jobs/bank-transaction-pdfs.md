# `app/worker/src/jobs/bank-transaction-pdfs.ts`

The fallback for a bank that provides no statement PDFs (Oct 12 ValorTax call, item H). Plaid Statements stays the first choice (`bank-statements.ts`); when a window month has no statement document, this job builds a **Transaction statement** PDF from the synced `bank_transactions` rows, stores it on the bank item and attaches it to the month cell.

## The rule

- A generated file is labelled, in its header, body and footer, as **not an official bank statement**, and its display name starts with `Transactions - ` rather than `Bank statement - `.
- The month cell **keeps its status** (`not_supported` or `missing`); only `document_id` is set. A real statement therefore still wins: the client portal keeps showing "Not from this bank" and may upload a real statement, which moves the cell to `manual` and replaces the document. No schema change was needed.

## `generateTransactionPdfs(env, conn, now = new Date())`

For each `bank_accounts` row of the connection (`listConnectionAccountRows`), for each cell of `getAccountCells` that

1. has `document_id === null`,
2. has `status` `not_supported` or `missing`, and
3. lies in `targetMonths(now, 6)` (`isInWindow`),

it loads that month's transactions (`listAccountMonthTransactions`), drops `pending` rows and skips the month when nothing is left. Otherwise it calls `storeProviderFile` with:

| Field | Value |
|-------|-------|
| `kind` / `group` | `bank` / `mask ?? external_account_id`, the same folder as the bank's own statements |
| `name` (storage key) | `{YYYY}-{MM}-transactions.pdf` |
| `displayName` (original_filename, what Review and Logics show) | `Transactions - September 2026 - x1234.pdf` (no ` - x…` part without a mask) |
| `mime` / `document_type` | `application/pdf` / `bank_transactions` |
| `bytes` | A loader that renders `renderTransactionStatement({ accountName, mask, year, month, transactions })` and copies the `Uint8Array` into an `ArrayBuffer`; it runs only when the key is not stored yet |
| `actor` | `provider:resspark` |

then `setMonthCell(env, account.id, year, month, cell.status, document_id)`. Returns `{ generated }`, the number of cells that received a document.

## Idempotence and limits

- `storeProviderFile` keys on the storage path, and a cell that already carries a document is skipped, so reruns from cron or webhooks store nothing new.
- `shortcut:` a generated statement is never rebuilt when later feed updates (`modified` / `added` rows) touch a closed month; upgrade when past-month corrections matter to the firm.
- Only transactions dated inside the calendar month count; the file has no opening or closing balance, because the feed does not carry one.

## Caller

`bank-reconcile.ts` `syncConnected` calls it once history is complete and no cell is `pending`, before the connection is marked `done`, wrapped so a failure only logs `connection.transaction_pdfs_failed`.

## Tests

`app/worker/src/jobs/bank-transaction-pdfs.test.ts` (see its companion doc).
