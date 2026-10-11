# `supabase/migrations/0005_connections.sql`

Phase 4 schema: the generalized `connections` representation for payroll (Truv) and bank (Plaid, later Teller) links, the webhook ledger, consents, bank rows, and the one RPC allowed to change a connection's status. Applied with `node app/scripts/db-migrate.mjs` and recorded in `public.app_migrations` as `0005_connections`. Additive only, re-runnable, wrapped in `BEGIN; ... COMMIT;`.

## Header

States the data rules: nothing earlier is dropped or renamed; provider-specific shapes live in `data jsonb` and in the Worker adapters, never in provider-named columns (assumption-delta decision "promote"); `external_id IS NULL` means the vendor has not issued an id; `connection_set_status()` is the only status writer; only the Worker (`service_role`) reads or writes.

## Tables

| Table | Purpose | Key points |
|-------|---------|-----------|
| `connections` | One row per attempt to connect a payroll or bank account for a request item. | `provider` in `plaid,truv,teller`; `kind` in `bank,payroll`; `status` in `pending,connected,syncing,done,error,removed` (default `pending`). `external_id` = Truv order id / Plaid item id. `link_ref` = Plaid link token. `return_nonce` (unique) and `return_nonce_used_at` back the Hosted Link return page (Plan 04). `data` holds provider detail (Truv `employers[]`, `order_expired_at`). `error` holds the last error detail. Timestamps: `last_webhook_at`, `last_polled_at`, `connected_at`, `completed_at`, `remove_after`, `removed_at`, `created_at`, `updated_at`. Cascades from `requests` and `request_items`. |
| `connection_secrets` | AES-GCM sealed provider access token (Plan 04). | Primary key is `connection_id` (one secret per connection), `key_version`, `ciphertext`, `iv`. Deleted with the connection. |
| `bank_accounts` | Accounts under a bank connection. | Unique `(connection_id, external_account_id)`; `mask`, `name`, `official_name`, `type`, `subtype`. |
| `bank_statement_months` | Per account, per month statement status (BANK-03). | Primary key `(bank_account_id, year, month)`; `month` 1..12; `status` in `pending,available,not_supported,manual,missing`; `document_id` points at the stored PDF and becomes NULL if the document row is deleted. |
| `bank_transactions` | One row per Plaid transaction. | `plaid_transaction_id` unique; `amount NUMERIC(14,2)`; dates; merchant and category fields; `pending`. |
| `webhook_events` | The D-01 ledger. | `provider` in `plaid,truv,docuseal`; `event_key` + `provider` unique, so a redelivery inserts nothing; `payload` is the verified body (headers and signatures are never stored); `status` in `queued,processing,done,ignored,dead`; `attempts`, `last_error`, `processed_at`. |
| `consents` | D-12 / BANK-05 consent records. | Unique `(link_id, kind, text_version)`; `kind` in `bank_data,payroll_data`; `ip_class`, `user_agent_class`. Cascades from `client_links` and `requests` so test cleanup can delete a request. |

`documents` gains `connection_id` (FK to `connections`, `ON DELETE SET NULL`) so provider-fetched files are traceable to their connection.

## Indexes

- `connections_provider_external_idx` UNIQUE `(provider, external_id) WHERE external_id IS NOT NULL`: one row per Truv order / Plaid item; the webhook consumer finds connections by it.
- `connections_link_ref_idx` (partial), `connections_item_idx (request_item_id, created_at DESC)` (latest connection for an item), `connections_request_idx` (cleanup and cascades), `connections_status_idx (status, last_polled_at)` (the cron reconciler in Plan 02).
- `bank_transactions_conn_date_idx (connection_id, date DESC, plaid_transaction_id)` for the staff transactions table; `bank_transactions_account_idx` and `bank_statement_months_document_idx` index the remaining foreign keys.
- `webhook_events_status_idx (status, received_at)` for the stuck-event re-enqueue in Plan 02.
- `consents_request_idx`, `documents_connection_id_idx` (partial).

`connections_touch_updated_at` reuses `public.touch_updated_at()` from migration 0003.

## `status_rank(s)`

| Status | Rank |
|--------|------|
| `pending` | 10 |
| `connected` | 30 |
| `syncing` | 40 |
| `error` | 45 |
| `done` | 50 |
| `removed` | 60 |
| anything else | -1 |

`error` sits below `done` so a stale error can never undo completion. A later `connected`, `syncing`, or `done` may still clear an error (for example `ITEM_LOGIN_REQUIRED`, then repaired) through the explicit exception in `connection_set_status`.

## `connection_set_status(p_connection_id, p_new_status, p_detail, p_actor_id)`

Returns `{ applied, status, item_status, request_status }`.

1. Missing connection: `RAISE EXCEPTION 'connection_not_found'`. Unknown status (rank -1): `RAISE EXCEPTION 'bad_status'`.
2. Locks the `requests` row, then the `connections` row, then the `request_items` row, all `FOR UPDATE`. This keeps migration 0004's lock order (request before item), so this RPC and `upload_complete` / `item_approve` serialize on the same request instead of deadlocking. Two concurrent calls on one connection serialize on these locks.
3. Equal status (`cur = new`): returns `applied: true` with no writes and no event. Exception: `error` to `error` overwrites `error` and logs again, because a new error reason is new information.
4. Lower rank: returns `applied: false`, no writes. Exception: from `error`, any status ranked at or above `connected` applies. `removed` (60) is terminal.
5. Otherwise updates the connection: `status`, `error` (the detail when the new status is `error`, else NULL), `connected_at` (first time it reaches connected/syncing/done), `completed_at` (first time `done`), `removed_at`, `last_polled_at`.
6. Item mapping, forward only: `connected|syncing|done` moves the item to `submitted` from `pending`, `in_progress`, or `rejected` (and clears `rejection_note`); `pending` moves it to `in_progress` from `pending` only. `approved` is never touched.
7. Logs `connection.<status>` through `log_event` with actor type `provider`, actor id `p_actor_id` or the provider name, and payload `p_detail` plus `connection_id`, `provider`, `kind`.
8. Recomputes the request status with `request_apply_status()` from migration 0004 (an item at `submitted` makes the request `waiting_on_staff`).

## `connection_record_event(p_connection_id, p_action, p_payload, p_actor_type, p_actor_id)`

Writes a firm/case/request-scoped event for a connection without changing its status (for example `job.failed`, `job.dead_lettered`, `connection.started`). Missing connection raises `connection_not_found`. The payload always gains `connection_id`.

## Grants

RLS is enabled on all seven tables with no policies; `REVOKE ALL` from `anon` and `authenticated` on each. The three functions are `SECURITY INVOKER` with `SET search_path = ''` and have `EXECUTE` revoked from `PUBLIC, anon, authenticated` (new functions are PUBLIC-executable by default; Supabase skill security checklist). Because PUBLIC is revoked, `service_role` gets explicit `EXECUTE` grants, as in migrations 0002 to 0004. `NOTIFY pgrst, 'reload schema'` makes PostgREST see the new tables and RPCs immediately.

## Verification

`app/worker/test/connections-tracer.test.ts` (live tracer), `app/worker/test/connections-live.test.ts` (rank matrix), `app/worker/test/rls.test.ts` (anon denied on every new relation).
