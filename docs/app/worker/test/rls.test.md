# `app/worker/test/rls.test.ts`

The PLAT-02 proof, run from outside the system. It calls the live project's PostgREST API the way a browser would, with the publishable key and no session (Postgres role `anon`). It asserts that every public table, and the `log_event` RPC, refuse the call. It is a standalone integration test, so it gets its own companion doc (D-23).

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
| 18-41 | `BASELINE_TABLE_COUNT = 15` and `TABLES`: the 15 baseline tables plus the 5 from migration 0002, hard-coded and sorted. Each table gets its own `it`, so a failure names the table and the output order is stable. |
| 43 | `describe.skipIf(!url || !key)`: with no env, the suite is skipped rather than failed. |
| 44-55 | `beforeAll` counts `^CREATE TABLE ` lines in `src/schemas/database_schema.sql` and fails the suite if there are not 15. A baseline table added there must also be added to `TABLES`. |
| 57-67 | For each table: `GET /rest/v1/<table>?select=*&limit=1` with the `apikey` header and no `Authorization`. It expects status 401 and body `code` `42501`. The key is always sent, because a request without it gets a different 401 from key validation that would prove nothing about grants. |
| 69-84 | `POST /rest/v1/rpc/log_event` with a JSON body of nulls must return 401 or 404, never 200. `EXECUTE` is revoked from `PUBLIC`, `anon`, and `authenticated`. |

## Result (2026-10-11, live project `zvkphuikjpwoauqdimcf`)

`Test Files 1 passed (1)`, `Tests 21 passed (21)`, 0 skipped.

## Maintenance

Every later migration that creates a public table must add the name to `TABLES`, keeping the list sorted. The test cannot list tables itself, because `anon` has no access to `pg_tables` through PostgREST.
