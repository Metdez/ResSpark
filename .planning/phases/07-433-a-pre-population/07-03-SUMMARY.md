---
phase: 07-433-a-pre-population
plan: 03
subsystem: database, scripts
tags: [supabase, seed, county-fips, plaid, truv, 433-a]
requires: [0008 county_fips_map, plaid_category_map, truv_deduction_map]
provides: [migration 0009_433a_seed (applied), app/scripts/build-433a-seed.mjs, app/scripts/lib/433a-mapping-rules.mjs]
affects: [07-05 address county lookup, 07-07 bank/payroll proposals, 07-09]
key-files:
  created: [app/scripts/build-433a-seed.mjs, app/scripts/lib/433a-mapping-rules.mjs, supabase/migrations/0009_433a_seed.sql, docs/app/scripts/build-433a-seed.md, docs/app/scripts/lib/433a-mapping-rules.md]
  modified: []
decisions:
  - "Puerto Rico is mapped through a generator-only USPS_EXTRA alias (PR -> Puerto Rico); the IRS publishes PR housing standards and state_aliases has no 'pr' row"
  - "COUNTY_OVERRIDES use the live IRS text, which for Chugach/Copper River includes ', Alaska'"
  - "Informational PFC hint rows (salary/wages, contractor/gig, rental) carry a column and reliability B so the bank aggregation can show cross-checks; pure informational rows have no reliability"
status: complete
actuals:
  tokens: 63400  # chars/4: 7,900 code+docs, 55,500 generated SQL
  tasks: 2
  commits: 14  # measured on the shared tree; 2 are 07-03's (f8bc452, d79afde), the rest other executors'
plan_head_before: 10d04dadd18ed67757e33e47af356b8d8ecbe415
plan_head_after: 9b48f7c78b6b9b94bc4a31feb52f284db4ed784e
completed: 2026-10-11
---

# Phase 7 Plan 03: 433-A seed (county FIPS, Plaid and Truv maps) Summary

A dependency-free generator turns the Census 2025 Gazetteer, Plaid's PFC taxonomy CSV, the live IRS housing names and a reviewed rules module into `0009_433a_seed.sql`. It is applied live: every mapped county resolves to an IRS housing amount, and both category maps live in SQL.

## Tasks
- Task 1 (tracer): `f8bc452`. County map generated and applied. The tracer verify (06037 → 3001, 0 unresolved counties) passed, then expanded.
- Task 2: `d79afde`. PFC_RULES, pfcDefault and TRUV_ROWS added, CSV reader and checks added, 0009 regenerated and re-applied by delete-and-rerun.

## Facts the plan asked to record
- Counties: 3,230 rows. 3,216 exact matches, 6 overridden, 8 old Connecticut (county NULL). 0 skipped. 3,222 have a county, and all resolve through `standards_housing_amount`.
- IRS housing rows with no FIPS: `Bedford city, Virginia`.
- Connecticut: 09110-09190 give 9 distinct housing amounts. 09001-09015 are present with county NULL and the note.
- PFC: 127 v2 + 3 v1 = 130 rows (9 income, 15 expense, 25 exclude, 81 informational). Truv: 15 rows.
- 0009 is 222,186 bytes and 3,406 lines. The Management API accepted it in one apply both times (initial apply and re-apply), so no batching was needed.
- The generator is deterministic: two runs produced identical SHA-1.

## Deviations from Plan
1. [Rule 2] Puerto Rico. The plan maps only USPS codes that have an alias, which would skip PR's 78 municipios even though the IRS publishes their housing standards. A generator-only `USPS_EXTRA = { PR: "Puerto Rico" }` maps them; `state_aliases` is unchanged. RESEARCH listed this as one of two options.
2. [Rule 2] The generator also checks that every `canonical_column` exists in `case_financial_data` (one live query), so a typo in the rules cannot reach the seed.
3. The override text for 02063/02066 is `Chugach Census Area, Alaska` / `Copper River Census Area, Alaska` (the live text). The plan said to confirm it against live data.

## Issues / notes
- `pnpm -C app run check` passed (exit 0; 134 files passed, 27 live suites skipped for missing env; lint warnings only, none in 07-03 files).
- FORM-07 and ADDR-02 are also declared by unfinished plans 07-05, 07-07 and 07-09, so neither is marked complete.
- USER ACTION (already recorded): a CPA/EA reviews `plaid_category_map` and `truv_deduction_map` before real cases.

## Self-Check: PASSED
