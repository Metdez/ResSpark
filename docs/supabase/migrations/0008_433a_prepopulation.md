# supabase/migrations/0008_433a_prepopulation.sql

All handwritten Phase 7 (433-A pre-population) SQL in one additive, re-runnable migration.
Applied to project `zvkphuikjpwoauqdimcf` with `node app/scripts/db-migrate.mjs` and recorded in
`public.app_migrations`. Standards amounts are untouched. `financial_value_decide` is the only
function that writes `case_financial_data` (D-06).

## Sections

| Section | Object | What it does |
|---|---|---|
| (a) | `cases.financials_settings` | JSON object, default `{}`: `{ window_months?: 3\|6, spouse_employer_ids?: string[] }` |
| (a) | `bank_accounts.balance_current / balance_available / balance_as_of` | Latest Plaid balances for the 433-A cash line |
| (a) | `determination_runs` | `id` gets `DEFAULT gen_random_uuid()`; adds `firm_id`, `created_by`, `allowable_breakdown`, `nre_lines`, `standards_inputs`, `standards_effective_date`, `engine_version` (D-15) |
| (b) | `financial_proposals` | Evidence trail behind every confirmed value (D-05). One `proposed` row per (case, column, source) via the partial unique index `financial_proposals_one_proposed`; lookup index on (case, column, created_at desc) |
| (b) | `plaid_category_map` | Plaid personal-finance category (detailed) to 433-A column, treatment, form line, reliability |
| (b) | `truv_deduction_map` | Truv pay-stub deduction category/name pattern to 433-A column |
| (b) | `county_fips_map` | Census county FIPS to the IRS state/county name; `county NULL` means "Needs data" |
| (b) | `standards_versions` | Single row (id = 1): effective date and source URL of the IRS standards in the database |
| (b) | RLS loop | RLS on and all privileges revoked from `anon`, `authenticated` for the five tables (deny by default; the Worker uses the service role) |
| (c) | `financial_column_type(column)` | `information_schema` data type of a writable `case_financial_data` column; NULL for unknown names and `case_id`, `updated_at`, `ai_flags` (the whitelist, T-07-04) |
| (c) | `financial_value_check(column, value)` | Raises `bad_column` or `bad_value`. boolean = JSON boolean; integer = JSON number with no fraction; numeric = JSON number with at most 2 decimals and below 1e12; text = JSON string up to 200 chars; jsonb (the two vehicle lists) = array of at most 20 non-negative numbers with at most 2 decimals; JSON null is always `bad_value` |
| (d) | `financial_value_decide(...)` | Staff decision. Locks the case row (`case_not_found` for another firm). Actions: `accept` (proposal value), `edit` (needs a note), `known_zero` (0), `not_applicable` (needs a note; given value or false / 0 / "not_applicable" / [] by column type, open question 2), `unknown` (NULL), `reject` (proposal only, no write). `accept`/`reject` need a `proposed` proposal of the same case and column, else `proposal_stale`. Writes one column through `format('%I')` and `jsonb_populate_record`; the two vehicle lists also write the legacy total as the list sum. Marks the proposal accepted/edited/rejected, or inserts a `staff` row when there is no proposal (`unknown` without a proposal is recorded by its event only, because `proposed_value` cannot be null). Logs `financial.value_<action>` with only `column`, `proposal_id`, `source`, `derived_from` (D-20) |
| (e) | `financial_proposals_upsert(...)` | Generator write path (D-07). Locks the case (serializes concurrent runs, so no 23505). Validates source (`bad_source`; `staff` is refused), each column/value, method, reliability and `source_refs`; refuses duplicate columns. Keeps an unchanged `proposed` row; supersedes a changed one; skips an insert whose value and method equal that source's latest accepted/edited row; supersedes the source's remaining `proposed` rows absent from the payload (within `p_scope_columns` when given). Logs `financials.proposals_updated` with counts only when something changed. Returns `{ inserted, kept, superseded }` |
| (f) | `standards_*` (six) | The six `src/standards_repository.py` queries, schema-qualified, returning NULL instead of raising |
| (f) | `standards_bundle(state, county, household, vehicles)` | One JSON object: national, health under 65 (age 30) and 65+, transportation area, ownership, operating, housing. With 0 vehicles the area is `''` and operating is the seeded zero-vehicle amount (D-11) |
| (g) | `financial_bank_monthly(...)` | Monthly cents per mapped column from non-pending transactions of the case's bank connections in the window. Income (and informational `INCOME`) counts money in (negative Plaid amounts, negated); all others count money out |
| (h) | `intake_submit(item, request, link)` | Client submits the intake item: `item_not_found`, or `already: true`, or moves it to `submitted`, logs `intake.submitted`, recomputes the request status |
| (i) | `logics_push_create_batch(...)` | Phase 5 body unchanged except eligibility: also accepts a `worksheet_433a` document with no request item that belongs to the request's case (D-16, open question 3) |
| (j) | Connecticut names | Names-only fix of housing rows 312/314/316/317 to the IRS planning-region names, cited to the IRS housing table effective 2026-06-29; verified by household-1 amounts 2388 / 2026 / 2359 / 2157 |
| (k) | Template + version | Appends an `intake` item to the standard template when missing; inserts the `standards_versions` row |
| (l) | Grants loop | `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` and `GRANT EXECUTE ... TO service_role` for every function above |

## RAISE tokens

`case_not_found`, `bad_action`, `bad_column`, `bad_value`, `note_required`, `proposal_stale`,
`bad_source`, `item_not_found` (plus the Phase 5 push tokens, unchanged).

## Re-applying after a fix

Every statement is re-runnable: edit the file, delete the `app_migrations` row for
`0008_433a_prepopulation` with `node app/scripts/db-migrate.mjs --query`, then run
`node app/scripts/db-migrate.mjs`.

## Tests

Smoke-checked at apply time (SQL): Los Angeles bundle (housing 3001, operating 0, ownership 0,
health 90/163, national 867), Miami-Dade 1 vehicle (area Miami, operating 423, ownership 703),
national for household 6 = 2970, the four Connecticut names resolve to 2388/2026/2359/2157 with no
`Region`/`Planning Region` row left, RLS on all five tables, zero PUBLIC/anon/authenticated
EXECUTE grants. The Worker live tests (`financials-rpc.test.ts`, `standards-bundle.test.ts`) are
still to be written (Plan 07-02 remainder).
