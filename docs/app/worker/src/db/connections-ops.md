# `app/worker/src/db/connections-ops.ts`

Read-side queries for Phase 4 connections. There are two groups: the cron selections (D-04, D-13) and the staff read model (D-10, PAY-04, BANK-03). Every query uses the per-request admin client, and none of them writes.

## Cron queries

| Export | Query |
|--------|-------|
| `listStaleConnections(env, olderThanMinutes = 10, limit = 50)` | Selects from `connections` where all of these hold: `status` is `pending`, `connected`, or `syncing`; `last_webhook_at` is null or older than the cutoff; `last_polled_at` is null or older than the cutoff; `created_at` is older than the cutoff and newer than 14 days (the Truv order expiry). Ordered by `last_polled_at` ascending, with never-polled rows first. The two `.or()` filters are combined with AND by PostgREST, which the live test confirms. In effect the query asks whether the most recent webhook or poll is older than the cutoff, so a connection that got a webhook 2 minutes ago is not polled again. Returns ids. |
| `listStuckWebhookEvents(env, olderThanMinutes = 2, limit = 50)` | Selects from `webhook_events` where `status = 'queued'`, the provider is `plaid`, `truv` or `docuseal` (the providers a `webhook` job carries; DocuSeal since Plan 06-04), and the row arrived before the cutoff. Oldest first. Returns `{ id, provider }`. |
| `expireStalePendingBank(env, hours = 6)` | Selects from `connections` where `kind = 'bank'`, `status = 'pending'`, and `created_at` is older than `hours`, at most 100 per tick. The select embeds `connection_secrets(connection_id)`, and the function returns the rows whose embed is empty. The secret check happens in JS rather than in a new SQL view, so no schema change is needed. PostgREST returns this one-to-one embed as an object or `null`; an array is handled too. |
| `listRemovalCandidates(env, limit = 20)` | Selects from `connections` where `provider = 'plaid'`, `removed_at is null`, and `remove_after <= now()`. It inner-joins `connection_secrets` (`!inner`), so only Items that still hold an access token come back. Ordered by `remove_after asc, id asc`. A `remove_after` equal to now counts as due. |

On error each query throws a fixed token (`connection_list_failed` or `webhook_list_failed`). Postgres error text never leaves the function.

## Staff read model

### Types

```ts
MonthCell      { year, month, status: 'pending'|'available'|'not_supported'|'manual'|'missing', document_id: string | null }
AccountSummary { id, external_account_id, mask, name, type, subtype, months: MonthCell[] }
EmployerView   { employer_id, company_name, status: 'pending'|'connected'|'done'|'error',
                 pay_stubs, w2s, income_reports, documents: { id, document_type, name }[] }
ConnectionSummary {
  id, request_item_id, kind, provider, status,
  error: { code, message? } | null,
  created_at, connected_at, completed_at, last_webhook_at, last_polled_at, remove_after,
  capabilities: BankCapabilities | null,
  accounts: AccountSummary[],
  transactions: { count, update_status: 'not_ready'|'initial'|'historical'|null },
  employers: EmployerView[]
}
TransactionRow { id, bank_account_id, date, authorized_date, name, merchant_name, amount: number,
                 iso_currency_code, category_primary, category_detailed, pending }
SummaryParts   { accounts (with nested bank_statement_months), transactionCount, documents }
```

### Projection rules (`projectSummary(conn, parts, now)`, pure)

- The summary is built from an explicit field list. `link_ref`, `return_nonce`, `sync_cursor`, `external_id`, and `data` itself never leave the Worker. `error` keeps only `code` and a string `message`.
- `capabilities` is `PROVIDER_CAPABILITIES[conn.provider]`. Payroll connections get `null`.
- `accounts` are sorted by `mask` ascending, then `id`, with null masks last. Each account's `months` is `targetMonths(now)`: six months, newest first, starting with last month. Each cell is looked up in the stored `bank_statement_months`. A month with no stored row is `missing` with `document_id: null`, and stored months outside the window are dropped (D-10, BANK-03).
- `transactions.update_status` maps `data.transactions_update_status`. Both Plaid's raw form (`HISTORICAL_UPDATE_COMPLETE`, `INITIAL_UPDATE_COMPLETE`, `NOT_READY`) and the lowercase form are accepted. Any other value, or no value, gives `null`.
- `employers` comes from `data.employers` (written by the Truv reconcile). An employer's documents are the `ready` connection documents whose storage group sits under `/payroll/` and ends with `-<employer_id>`. Plan 04-03 names that group `<company-slug>-<employer_id>`, so two employers with the same company name never share files. Counts are taken by `document_type` (`pay_stub`, `w2`, `income_report`). An unknown employer status reads as `pending` (PAY-04).

### Queries

| Export | What it does |
|--------|--------------|
| `getConnectionSummary(env, conn, now?)` | Runs three queries in parallel: `bank_accounts` with nested `bank_statement_months`; an exact head-only count of `bank_transactions`; and the `documents` for the connection with `status = 'ready'`, ordered by upload time. Then calls `projectSummary`. Throws `connection_summary_failed`. |
| `firmOwnsRequest(env, firmId, requestId)` | `true` only when the request belongs to the firm. |
| `listRequestConnections(env, firmId, requestId)` | Connections where both `request_id` and `firm_id` match and `kind` is `bank` or `payroll` (signature rows belong to the e-sign card, Plan 06-07), ordered `created_at DESC, id DESC`, each mapped to a summary. |
| `latestItemSummary(env, requestItemId)` | The newest connection for an item (`latestConnectionForItem`) as a summary, or `null`. The client item view uses it for bank items. |
| `payrollItemSummaries(env, requestItemId)` | Every `payroll` connection on the item, ordered `created_at DESC, id DESC`, each mapped to a summary. "Add another employer" after an order is done opens a second Truv order on the same item, so the client payroll sheet needs all of them (follow-up fix 2026-10-11). Throws `connection_list_failed`. |
| `getFirmConnection(env, firmId, connectionId)` | The row, or `null` when it is missing or belongs to another firm. |
| `windowStart(now, months)` | The first day, in UTC, of the month `months` before now, as `YYYY-MM-DD`. |
| `listConnectionTransactions(env, firmId, connectionId, months, limit = 1000, now?)` | Calls `getFirmConnection` first and returns `null` when it is not found. Otherwise selects `bank_transactions` with `date >= windowStart`, ordered by `date DESC, plaid_transaction_id ASC` so rows with the same date stay in a stable order. Includes an exact `total` and converts `amount` (NUMERIC, which arrives as a string) to a number. Throws `transaction_list_failed`. |

## Tests

- `app/worker/src/db/connections-ops.test.ts` (unit) covers `projectSummary`.
- `app/worker/test/connections-ops-live.test.ts` (live) seeds connections under the test firm. It checks each cron selection by whether its own ids are present, absent, and in the right order, and it checks the read model, firm scoping, and the transaction window and order against real rows.
