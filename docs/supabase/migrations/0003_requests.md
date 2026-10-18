# `supabase/migrations/0003_requests.sql`

Phase 2 data foundation (02-CONTEXT D-01, D-05, D-06, D-08, D-10, D-12, D-14). It adds the request lifecycle tables, the Logics identity columns on `cases`, the global request templates, and the six RPCs that are the only write path for a request: confirm, create, send, open, regenerate, revoke. It was applied to the live project `zvkphuikjpwoauqdimcf` by `node app/scripts/db-migrate.mjs`, which recorded it in `public.app_migrations`.

The file is additive only. It never drops, renames, or retypes a baseline or Phase 1 column. The single tightening, `client_links.request_id SET NOT NULL`, is guarded: it raises instead of deleting rows. Every statement can run again safely (`IF NOT EXISTS`, `OR REPLACE`, `ON CONFLICT DO NOTHING`, guarded `DO` blocks, idempotent `REVOKE`/`GRANT`).

| Lines | What it does |
|-------|--------------|
| 1-14 | Header: the data rules (additive only, the Worker is the only reader and writer, every state change goes through an RPC that writes its event in the same transaction, NULL means unknown) and the re-runnable promise. |
| 16, 414 | `BEGIN;` / `COMMIT;`. The Management API runs the file as one query string, so the whole migration is all-or-nothing. |
| 18-31 | `firm_integrations` (D-01): one row per firm and provider (`UNIQUE (firm_id, provider)`, named `firm_integrations_firm_provider_key`). `provider` is only `logics` for now. `api_key_ciphertext` / `secret_ciphertext` hold AES-GCM ciphertext produced in the Worker; the database never sees plaintext. `key_hint` is the last 4 characters of the API key for the Settings page. `last_test_at` / `last_test_ok` record the last "Test connection". `updated_by` → `auth.users`. |
| 33-40 | `request_templates` (D-06): `firm_id NULL` means a global template. `items` must be a non-empty JSON array (CHECK), each item shaped `{kind, label, required, config}`. |
| 42-59 | `requests` (D-06): one request per send to a client. `case_id` → `cases` with `ON DELETE CASCADE`. `status` is one of `draft`, `sent`, `opened`, `in_progress`, `waiting_on_staff`, `complete`, `revoked`. **Planner assumption (confirm or overrule):** `contact_email` and `contact_phone_e164` are two columns beyond D-06's list. They persist the destination staff confirmed at send time, for the "email the link" action (D-09) and for the send-time comparison against Logics (LOOK-04). |
| 61-75 | `request_items` (D-06): the steps of a request. `position` is unique per request (`request_items_request_position_key`); two items may share a `kind` or a `label`. `kind` is `bank_connect`, `payroll_connect`, `address`, `upload`, `signature`, or `intake`; `status` is `pending`, `in_progress`, `submitted`, `approved`, or `rejected`. `config` holds per-kind settings such as `doc_code`. |
| 77-83 | `client_sessions` (D-12): the client heartbeat, one row per link (`link_id` PK → `client_links`, cascade). `user_agent_class` is `phone`, `tablet`, or `desktop`. |
| 85-94 | `touch_updated_at()`: a trigger function that sets `NEW.updated_at := now()`. `search_path = ''`. |
| 96-99 | Drop-and-create of the `requests_touch_updated_at` trigger (`BEFORE UPDATE`), so `requests.updated_at` is always current without each RPC setting it. |
| 101-107 | Adds the Logics identity and contact columns to `cases` (D-05), all nullable. `logics_snapshot` holds only the normalized identity and contact summary. The Worker must never put Logics `DOB`, `TaxLiability`, `TaxAmount`, or `MaritalStatus` in it. |
| 109-110 | `cases_firm_logics_case_idx`: unique on `(firm_id, logics_case_id)` where `logics_case_id IS NOT NULL`. It is the conflict target of `case_confirm_logics`, so one Logics case maps to one ResSpark case per firm. |
| 112-120 | The guarded NOT NULL. A `DO` block raises `client_links has rows without request_id; backfill or delete them before 0003` if any row lacks a request; otherwise `request_id` becomes `NOT NULL`. On the live apply there were 0 rows, so the guard did not fire. |
| 122-134 | Adds the FK `client_links_request_id_fkey` → `requests(id) ON DELETE CASCADE`, inside a `DO` block that first checks `pg_constraint` (Postgres has no `ADD CONSTRAINT IF NOT EXISTS`). |
| 136-140 | Indexes. `client_links_request_id_key` is unique: one link per request, and Regenerate bumps `version` on that row (D-08). The Phase 1 non-unique `client_links_request_id_idx` stays (additive only). `requests_firm_status_idx` serves the firm's request list by status, `requests_case_id_idx` and `request_items_request_id_idx` cover their FKs. |
| 142-155 | Seeds two global templates with fixed ids. `Standard resolution packet` (`...a001`): bank connection, payroll connection, address confirmation, Government ID upload (`doc_code: government_id`), engagement letter signature. `Documents only` (`...a002`): Government ID, last 3 bank statements (`bank_statements`), last 2 pay stubs (`pay_stubs`). The `doc_code` values reuse the codes in `src/frontend/src/document-upload/requests.ts`. Migration 0011 adds a third global template, `Bank and payroll` (`...a003`): bank connection and payroll connection only. |
| 157-159 | Rules shared by every RPC: `SECURITY INVOKER` (they run with `service_role`'s own grants), `SET search_path = ''` with every name schema-qualified, bare-token errors, and a fixed lock order (the `requests` row first, then the `client_links` row) so two RPCs on the same request cannot deadlock. |
| 161-198 | `case_confirm_logics(p_firm_id, p_logics_case_id, p_first_name, p_last_name, p_email, p_phone_e164, p_snapshot, p_actor_id, p_search_type) → uuid`. Upserts on `(firm_id, logics_case_id)`: a new case gets `gen_random_uuid()` (the baseline `cases.id` has no default); an existing case gets the fresh name, contact, snapshot, `logics_fetched_at` and `updated_at`. Two staff confirming the same case at once both succeed and get the same id. Logs `case.looked_up` with `{search_type, logics_case_id}`, never the raw search value. |
| 200-237 | `request_create(p_firm_id, p_case_id, p_template_name, p_items, p_created_by, p_agent_display_name) → uuid`. Raises `no_items` for a NULL, non-array, or empty `p_items`, and `case_not_found` if the case is not in `p_firm_id`. Inserts the `draft` request and all items in one statement, numbering `position` 1..N from the array order (`WITH ORDINALITY`); `required` defaults to true and `config` to `{}`. Logs `request.created` with `{template_name, item_count}`. Any failure rolls back the whole call, so there is never a partial request. |
| 239-277 | `request_send(p_request_id, p_firm_id, p_actor_id, p_contact_email, p_contact_phone_e164, p_expires_in_days = 14, p_payload = {}) → table (link_id, version, expires_at)`. Locks the request (`FOR UPDATE`), raises `request_not_found` or `request_not_draft`, inserts the `client_links` row (version 1, `expires_at = now() + 14 days` as a full timestamptz), sets the request to `sent` with `sent_at` and the contact fields, and logs `request.sent` with the caller's payload. The output column names match `client_links` columns, so the SQL inside qualifies them with the alias `cl`. |
| 279-311 | `request_regenerate_link(p_request_id, p_firm_id, p_actor_id, p_expires_in_days = 14) → table (link_id, version, expires_at)`. Locks the request; raises `request_not_found`, or `request_not_active` unless status is `sent`, `opened`, `in_progress`, or `waiting_on_staff`. Bumps `version` and resets `expires_at` on the request's link row (the Worker's token carries the version, so older links stop working). Logs `request.link_regenerated` with `{version}`. |
| 313-339 | `request_revoke(p_request_id, p_firm_id, p_actor_id) → void`. Locks the request; raises `request_not_found`, or `request_revoked` if already revoked. Sets `client_links.revoked_at`, status `revoked`, and logs `request.revoked`. |
| 341-377 | `request_open(p_link_id) → timestamptz`, called for the client's Start tap (D-10, PORT-02). No firm argument: the link id comes from a verified token. Raises `link_inactive` if the link does not exist, is revoked, or `expires_at <= now()` (full timestamp comparison, never rounded to a day). If the link was already opened it returns the stored `opened_at` and writes nothing (PORT-04 reopen). Otherwise a guarded `UPDATE ... WHERE opened_at IS NULL` sets `opened_at`, moves the request from `sent` to `opened`, and logs exactly one `request.opened` event (actor `client`, actor id = link id). |
| 379-386 | RLS on for the five new tables (RESEARCH F-6). No policies for `anon`/`authenticated` (D-12 carried forward). |
| 388-394 | The same deny-by-default block as 0002: revoke every existing `anon`/`authenticated` privilege on tables, sequences, and functions in `public`, and keep `postgres`'s default privileges revoked. |
| 396-403 | Revokes `EXECUTE` on all seven new functions from `PUBLIC`, `anon`, and `authenticated`. |
| 404-410 | Grants `EXECUTE` on the six RPCs to `service_role` explicitly, because the Worker calls them as that role and `PUBLIC` no longer covers it. The trigger function needs no grant to fire. |
| 412 | `NOTIFY pgrst, 'reload schema'` so PostgREST sees the new tables and RPCs immediately. |

## Error tokens the Worker maps

Each RPC raises a bare token (no ids, no values) with SQLSTATE `P0001`; supabase-js surfaces it as `error.message`.

| Token | Raised by | Meaning |
|-------|-----------|---------|
| `no_items` | `request_create` | `p_items` is NULL, not an array, or empty |
| `case_not_found` | `request_create` | the case is not in this firm |
| `request_not_found` | `request_send`, `request_regenerate_link`, `request_revoke` | no request with this id in this firm |
| `request_not_draft` | `request_send` | the request was already sent (or revoked) |
| `request_not_active` | `request_regenerate_link` | status is `draft`, `complete`, or `revoked` |
| `request_revoked` | `request_revoke` | already revoked |
| `link_inactive` | `request_open` | link missing, revoked, or expired |

## Event actions introduced

`case.looked_up`, `request.created`, `request.sent`, `request.link_regenerated`, `request.revoked`, `request.opened`.

## Live state after apply (verified 2026-10-11)

- `db-migrate.mjs --status` lists `0002_platform_foundation` and `0003_requests`; `--dry-run` prints `0 pending`.
- 25 tables in `public`; the 5 new ones have `rowsecurity = true`.
- 0 rows in `role_table_grants`, `role_routine_grants`, and `role_usage_grants` for `anon`/`authenticated`.
- The six RPCs have `prosecdef = false`; their ACL is `{postgres=X, service_role=X}`.
- `request_templates` has 2 global rows (5 and 3 items); `client_links.request_id` is `NOT NULL`; `cases` has the 6 new columns.

## Known limit

`events.case_id` references `cases` with no `ON DELETE` action and `events` is append-only, so a case that has events can never be deleted. `app/worker/test/requests-live.test.ts` therefore keeps one fixed probe case (Logics id `999999001`) and deletes only its requests.
