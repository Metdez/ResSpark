# `supabase/migrations/0002_platform_foundation.sql`

Phase 1 data foundation (D-10, D-11, D-12). It adds the platform tables next to the 15 baseline tables from `src/schemas/database_schema.sql`, the `log_event()` write path for the audit trail, and makes deny-by-default durable. It was applied to the live project `zvkphuikjpwoauqdimcf` by `node app/scripts/db-migrate.mjs`, which recorded it in `public.app_migrations`.

The file is additive only. It never drops, renames, or retypes a baseline column, and it never touches the IRS standards rows or `supabase_migrations.schema_migrations`. Every statement can run again safely (`IF NOT EXISTS`, `OR REPLACE`, `ON CONFLICT DO NOTHING`, and `REVOKE`, which is idempotent). The whole file was re-run against the live project after the first apply, with no error and no duplicate rows.

| Lines | What it does |
|-------|--------------|
| 1-13 | Header: the data rules (additive only, the Worker is the only reader and writer, `events` is append-only, NULL means unknown) and the re-runnable promise. |
| 15, 138 | `BEGIN;` / `COMMIT;`. The Management API runs the file as one query string, and the explicit transaction makes it all-or-nothing. |
| 17-20 | `app_migrations (name, applied_at)`: the runner's ledger. `db-migrate.mjs` also creates it before reading it, so a fresh project works. It lives here as well so the file describes the full schema. |
| 22-27 | `firms`: one row per tax firm. `settings JSONB` holds per-firm configuration such as the Logics placeholders. |
| 29-35 | `staff_profiles`: one row per staff login. `user_id` → `auth.users` with `ON DELETE CASCADE` (a profile means nothing without its user). `role` is `staff` or `admin`. |
| 37-48 | `events`: the audit trail (PLAT-04). `id` is `BIGINT GENERATED ALWAYS AS IDENTITY`, so it rises monotonically. Consumers order by `id DESC`, which stays stable when two rows share a `created_at`. `case_id` is a nullable FK to `cases` with no `ON DELETE` action: a cascade or `SET NULL` would be an UPDATE/DELETE that the append-only trigger rejects. `request_id` has no FK yet, because the `requests` table arrives in Phase 3. `actor_type` is one of `staff`, `client`, `system`, `provider`. |
| 50-60 | `client_links`: client magic-link records. `version` supports revoke-and-reissue, and `expires_at`, `revoked_at`, `opened_at` track the link's lifecycle. `request_id` gets its FK when `requests` exists. |
| 62-67 | Adds `firm_id`, `logics_case_id`, `retention_until` to `cases`, all nullable. **Accepted debt:** onboarding a second firm needs a backfill and then `firm_id NOT NULL`. |
| 69-72 | Indexes, named `<table>_<col>_idx`. `events_firm_created_idx (firm_id, created_at DESC)` serves the firm activity feed, `events_case_id_idx` the per-case history, and the other two cover their FKs and lookups. |
| 74-92 | `log_event(...)` returns the new `events.id`. It is `LANGUAGE SQL`, `SECURITY INVOKER` (it runs with the caller's grants, so only `service_role` can insert), and `SET search_path = ''` (every name is schema-qualified, so a hostile `search_path` cannot redirect it). A NULL payload is stored as `{}`. |
| 94-102 | `events_append_only()`: a trigger function that always raises `events is append-only`. |
| 104-107 | Drop-and-create of the `events_append_only` trigger, `BEFORE UPDATE OR DELETE ... FOR EACH ROW`. |
| 109-111 | Seeds the single firm `00000000-0000-0000-0000-000000000001` / `ValorTax` with `settings = {"logics": {"api_key_set": false}}`. |
| 113-117 | Why the grants block exists (RESEARCH F-6). Before this migration, `pg_default_acl` for `postgres` in `public` gave `anon` and `authenticated` full rights on every NEW table, sequence, and function. |
| 118-122 | RLS on for the five new tables, one `ALTER TABLE` each (Postgres has no multi-table form). The 15 baseline tables already had RLS on. |
| 124-126 | Removes every existing `anon`/`authenticated` privilege on tables, sequences, and functions in `public`. |
| 128-130 | Changes `postgres`'s default privileges so objects created by later migrations start with no `anon`/`authenticated` grant. |
| 132-134 | Revokes `EXECUTE` on both new functions from `PUBLIC`, `anon`, and `authenticated`. `anon` would otherwise inherit it through `PUBLIC`. |
| 135-136 | Grants `EXECUTE` on `log_event` to `service_role` explicitly, because the Worker calls it as that role. A trigger needs no `EXECUTE` grant to fire. |

## Live state after apply (verified 2026-10-11)

- 20 tables in `public`, all with `rowsecurity = true`, and 0 policies for `anon`/`authenticated`.
- 0 rows in `information_schema.role_table_grants`, `role_routine_grants`, and `role_usage_grants` for `anon`/`authenticated`.
- `service_role` holds 35 table privileges across the 5 new tables (7 each).
- `log_event` and `events_append_only` have `prosecdef = false`, `search_path=""`, and ACL `{postgres=X, service_role=X}`.
- The baseline is untouched: `housing_utilities_standards` still has 16,115 rows and `question_definitions` 28.

## Known limit

`pg_default_acl` rows owned by `supabase_admin` still grant `anon`/`authenticated` on objects that `supabase_admin` creates, and the `postgres` role cannot change them. Migrations run as `postgres`, so this does not affect them (RESEARCH A-8). `app/worker/test/rls.test.ts` would catch any table that leaked.

## Adding a later migration

Create `supabase/migrations/NNNN_<name>.sql` in the same style, then run `node app/scripts/db-migrate.mjs`. A new table must also be added to `TABLES` in `app/worker/test/rls.test.ts`.
