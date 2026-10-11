# `app/worker/test/rls.test.ts`

The PLAT-02 proof, run from outside the system. It calls the live project's PostgREST API the way a browser would, with the publishable key and no session (Postgres role `anon`). It asserts that every public table, and the `log_event`, `connection_set_status` and `request_send` RPCs, refuse the call. It is a standalone integration test, so it gets its own companion doc (D-23).

Run it with:

```
pnpm -C app run test:rls
```

The `test:rls` script loads `src/frontend/.env` through `dotenv-cli` (it provides `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`) and runs only this file in the `worker-node` Vitest project (plain Node `fetch`, no Workers bindings). `pnpm -C app run test:live` loads the same file after `app/.env` and `app/.dev.vars`. A plain `pnpm test` has no env, so the suite is reported as skipped.

| Lines | What it does |
|-------|--------------|
| 1-3 | Imports: `node:fs` and `node:url` to read the baseline schema, plus Vitest. |
| 5-11 | Why the assertion is a strict 401. RLS with zero policies still answers `200 []` when a table grant exists, so the RESEARCH draft's `200 []` tolerance would let an empty table such as `client_links` pass while grants leak. With grants revoked (F-5, F-6, migration 0002), Postgres raises `42501` and PostgREST maps that to 401 for `anon`. |
| 13-16 | The URL and key come from `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`, falling back to the `VITE_` names. |
| 18-56 | `BASELINE_TABLE_COUNT = 15` and `TABLES`: the 15 baseline tables, the 5 from migration 0002, the 5 from migration 0003 (`client_sessions`, `firm_integrations`, `request_items`, `request_templates`, `requests`), the migration 0004 view `request_dashboard_v` (Plan 03-01), and the 7 from migration 0005 (Plan 04-01: `bank_accounts`, `bank_statement_months`, `bank_transactions`, `connection_secrets`, `connections`, `consents`, `webhook_events`), hard-coded and sorted: 33 names. The view is probed like a table: `REVOKE ALL` from `anon` makes PostgREST answer 401 `42501` for it too. Each table gets its own `it`, so a failure names the table and the output order is stable. |
| 58 | `describe.skipIf(!url || !key)`: with no env, the suite is skipped rather than failed. |
| 59-70 | `beforeAll` counts `^CREATE TABLE ` lines in `src/schemas/database_schema.sql` and fails the suite if there are not 15. A baseline table added there must also be added to `TABLES`. |
| 72-82 | For each table: `GET /rest/v1/<table>?select=*&limit=1` with the `apikey` header and no `Authorization`. It expects status 401 and body `code` `42501`. The key is always sent, because a request without it gets a different 401 from key validation that would prove nothing about grants. |
| 84-99 | `POST /rest/v1/rpc/log_event` with a JSON body of nulls must return 401 or 404, never 200. `EXECUTE` is revoked from `PUBLIC`, `anon`, and `authenticated`. |
| 101-108 | The same probe for `POST /rest/v1/rpc/connection_set_status` (migration 0005), standing in for the three Phase 4 functions (`status_rank`, `connection_set_status`, `connection_record_event`), which carry the same `REVOKE EXECUTE`. |
| 110-123 | The same probe for `POST /rest/v1/rpc/request_send` (migration 0003), standing in for all six Phase 2 RPCs, which carry the same `REVOKE EXECUTE`. |

## Result (2026-10-11, live project `zvkphuikjpwoauqdimcf`)

`Test Files 1 passed (1)`, `Tests 28 passed (28)`, 0 skipped (25 tables + 1 view + 2 RPC probes, after migration 0004).

After migration 0005 (Plan 04-01): 36 passed, 0 skipped (32 tables + 1 view + 3 RPC probes); `webhook_events`, `connection_secrets`, `bank_statement_months` and the other new tables all answer 401 `42501`.

## Maintenance

Every later migration that creates a public table must add the name to `TABLES`, keeping the list sorted. The test cannot list tables itself, because `anon` has no access to `pg_tables` through PostgREST.
