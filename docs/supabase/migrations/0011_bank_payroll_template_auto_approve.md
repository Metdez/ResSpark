# `supabase/migrations/0011_bank_payroll_template_auto_approve.sql`

Two changes from the ValorTax call on Oct 12 2026 (`.planning/Client/call2.md`): a third global request template with only the bank and payroll connections, and `connection_set_status()` approving the request item when a connection reaches `done`. Additive only, re-runnable, wrapped in `BEGIN; ... COMMIT;`. Applied with `node app/scripts/db-migrate.mjs`, which records it in `public.app_migrations`.

## Why

- "The main things we care about is connect your bank, connect your payroll." The seeded default was the six-item Standard packet (address, Government ID, engagement letter and intake on top of the two connections).
- "I want this to be green so people can be like, okay, I'm connected. Right now it's saying yellow 'with agent'." A finished connection left its item at `submitted` (amber "Needs review" for staff, "With your agent" for the client), and a bank item with no statement PDFs could never be approved in the review UI (`hasFiles` gate), so the request never completed.

## (a) Template `Bank and payroll`

| id | firm_id | name | items |
|---|---|---|---|
| `00000000-0000-0000-0000-00000000a003` | `NULL` (global) | `Bank and payroll` | `bank_connect` "Connect your bank" (required), `payroll_connect` "Connect your payroll" (required) |

`ON CONFLICT (id) DO NOTHING`. Templates `a001` (Standard resolution packet) and `a002` (Documents only) are untouched, so address, ID, signature and intake stay available through the Standard packet. Preselecting this template in the request builder is a separate change in the same quick task.

## (b) `connection_set_status(p_connection_id, p_new_status, p_detail, p_actor_id)`

Same signature, same lock order, same rank rules and same `connection.<status>` event as migration 0005 (see `docs/supabase/migrations/0005_connections.md`). Only the item mapping block changed.

Item transition when a connection status is applied:

| Connection status | Item before 0011 | Item after 0011 | Moves the item from |
|---|---|---|---|
| `pending` | `in_progress` | `in_progress` | `pending` |
| `connected`, `syncing` | `submitted` | `submitted` | `pending`, `in_progress`, `rejected` |
| `done`, connection kind `bank` or `payroll` | `submitted` | **`approved`** | `pending`, `in_progress`, `submitted`, `rejected` |
| `done`, connection kind `signature` | `submitted` | `submitted` | `pending`, `in_progress`, `rejected` |
| `error`, `removed` | unchanged | unchanged | - |

- The item only moves forward. `approved` is never regressed by any connection status, including a late `connected` on an already approved item (the `WHERE` clause excludes it).
- `rejection_note` is cleared when the item moves to `submitted` or `approved`.
- Staff can still Reject an auto-approved item: `item_reject` (0004) accepts `approved`. Rejecting puts the item back in the client's hands; a later `done` on a new connection approves it again.

### Event

When the `done` mapping changes the item (`FOUND` is true right after the `UPDATE`), the function logs `item.approved` through `log_event` with actor type `provider`, actor id `p_actor_id` or the provider name (`plaid`, `truv`, `teller`), and payload `{request_item_id, label, auto: true}`. This mirrors the event `item_approve` writes for staff, so the audit log (PLAT-04) shows who or what approved; `auto: true` tells the two apart. It is written in the same transaction, just before `connection.done`. A repeated `done` is the 0005 idempotent no-op and logs nothing.

### Request status

`request_apply_status()` (0004) still runs last. With the item at `approved`, a request whose other required items are all approved becomes `complete` with `completed_at` set, where it used to stop at `waiting_on_staff`. The Worker's `setConnectionStatus()` returns the new values (`item_status: 'approved'`, `request_status: 'complete'` for a single-item request); no Worker code branches on them.

Only the Plaid bank reconcile (`app/worker/src/jobs/bank-reconcile.ts`) and the Truv payroll reconcile (`jobs/payroll-reconcile.ts`) reach the approve branch. The DocuSeal signature reconcile (`jobs/signature-reconcile.ts`) also reports `done`, but its connection kind is `signature`, so a completed e-signature still lands at `submitted` for staff review exactly as Phase 6 verified it; the Oct 12 call only asked for the bank and payroll steps to read done on their own.

## Grants

`EXECUTE` on `connection_set_status` is revoked from `PUBLIC`, `anon` and `authenticated` and granted to `service_role` again. `CREATE OR REPLACE` keeps the existing ACL, so on the live project these are no-ops; they matter on a fresh database.

## Apply

```powershell
node app/scripts/db-migrate.mjs
```

## Verification

Live tests updated for the new transition: `app/worker/test/connections-live.test.ts` (syncing to done approves the item, completes the request and logs one `item.approved` with `auto: true`), `connections-tracer.test.ts`, `payroll-fetch.test.ts` and `bank-statements.test.ts`. `esign-complete.test.ts` keeps `submitted` / `waiting_on_staff` (signature kind). `connected` still leaves the item `submitted` (`bank-complete.test.ts`, unchanged). They need `SUPABASE_URL` and `SUPABASE_SECRET_KEY` and run after the migration is applied.
