# `app/src/features/review/connections/api.ts`

Typed staff client for the Plan 04-02 admin connection routes (`app/worker/src/routes/admin-connections.ts`). The shapes mirror `ConnectionSummary`, `AccountSummary`, `MonthCell`, `EmployerView` and `TransactionRow` from `app/worker/src/db/connections-ops.ts`. They are copied, not imported, because the SPA and the Worker are separate builds. Every response passes a type guard before the SPA uses it; a body that fails the guard becomes `ApiError(500, 'invalid_response')` inside `api()`.

## Types

| Type | Fields the SPA reads |
|------|----------------------|
| `MonthCell` | `year`, `month`, `status` (`available`, `manual`, `not_supported`, `missing`, `pending`), `document_id` (set for `available` and `manual`). |
| `AccountSummary` | `id`, `mask`, `name`, `type`, `subtype`, `months` (the six-month window, newest first). |
| `PayStubRow` | One pay stub from the stored Truv report: `pay_date` (`YYYY-MM-DD`), `gross_pay` and `net_pay` (number or `null` when the report lacks a usable figure), `document_id` (the stored stub PDF, or `null`). |
| `EmployerView` | `employer_id`, `company_name`, `status`, the three counts (`pay_stubs`, `w2s`, `income_reports`), `documents` (`id`, `document_type`, `name`), and `recent_pay` (optional in the guard so an older Worker response still renders; the last three months of stubs, newest first; the payroll panel's "Last 3 months" table). |
| `ConnectionSummary` | `id`, `request_item_id`, `kind` (`bank` or `payroll`), `provider`, `status`, `error` (`{ code, message? }` or `null`), `created_at`, `last_webhook_at`, `last_polled_at`, `accounts`, `transactions` (`count`, `update_status`), `employers`. The Worker sends more fields (`capabilities`, `remove_after`, and so on); the SPA ignores them. |
| `TransactionRow` | `id`, `date`, `name`, `merchant_name`, `amount` (Plaid sign: positive is money out), `iso_currency_code`, `category_primary`, `category_detailed` (optional in the guard so an older response still passes; the spending summary reads it), `pending`. |
| `TransactionsResponse` | `months` (3 or 6), `total` (all rows in the window), `transactions` (the rows sent, capped at 1000 by the Worker). |

## Guards

`str`, `strOrNull`, `num`, `numOrNull` are one-line checks. `isMonth`, `isAccount`, `isEmployerDoc`, `isPayStub`, `isEmployer`, `isTransaction` validate one nested record each; `isEmployer` accepts a missing `recent_pay` and otherwise requires an array of `isPayStub` rows. `isConnectionSummary` rejects any `kind` other than `bank` or `payroll` (signature rows belong to the e-sign card). `isConnectionsResponse` checks `{ connections: ConnectionSummary[] }`; `isTransactionsResponse` checks the transactions body; `isRefreshResponse` (module-private) checks `{ connection }`.

## Calls

| Function | Request |
|----------|---------|
| `fetchConnections(requestId)` | `GET /api/admin/requests/:id/connections`. Newest connection first (the Worker orders it). |
| `refreshConnection(connectionId)` | `POST /api/admin/connections/:id/refresh`. The Worker re-reads the provider and returns the fresh summary. Errors: 502 `provider_unavailable`, 503 `provider_not_available`, 409 `provider_error`, 404 `not_found`. |
| `fetchTransactions(connectionId, months)` | `GET /api/admin/connections/:id/transactions?months=3` or `6`. |

All three go through `api()` from `lib/api.ts`, which attaches the staff Bearer token. Ids are URL-encoded.
