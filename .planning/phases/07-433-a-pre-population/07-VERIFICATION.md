---
phase: 07-433-a-pre-population
verified: 2026-10-11T19:57:53Z
status: human_needed
score: 66/71 must-haves verified (5 present, behavior-unverified; 1 via override)
covered_files:
  - ".planning/phases/07-433-a-pre-population/07-01-PLAN.md"
  - ".planning/phases/07-433-a-pre-population/07-01-SUMMARY.md"
  - ".planning/phases/07-433-a-pre-population/07-02-PLAN.md"
  - ".planning/phases/07-433-a-pre-population/07-02-SUMMARY.md"
  - ".planning/phases/07-433-a-pre-population/07-03-PLAN.md"
  - ".planning/phases/07-433-a-pre-population/07-03-SUMMARY.md"
  - ".planning/phases/07-433-a-pre-population/07-04-PLAN.md"
  - ".planning/phases/07-433-a-pre-population/07-04-SUMMARY.md"
  - ".planning/phases/07-433-a-pre-population/07-05-PLAN.md"
  - ".planning/phases/07-433-a-pre-population/07-05-SUMMARY.md"
  - ".planning/phases/07-433-a-pre-population/07-06-PLAN.md"
  - ".planning/phases/07-433-a-pre-population/07-06-SUMMARY.md"
  - ".planning/phases/07-433-a-pre-population/07-07-PLAN.md"
  - ".planning/phases/07-433-a-pre-population/07-07-SUMMARY.md"
  - ".planning/phases/07-433-a-pre-population/07-08-PLAN.md"
  - ".planning/phases/07-433-a-pre-population/07-08-SUMMARY.md"
  - ".planning/phases/07-433-a-pre-population/07-09-PLAN.md"
  - ".planning/phases/07-433-a-pre-population/07-09-SUMMARY.md"
  - ".planning/phases/07-433-a-pre-population/07-10-PLAN.md"
  - ".planning/phases/07-433-a-pre-population/07-10-SUMMARY.md"
  - ".planning/phases/07-433-a-pre-population/07-11-PLAN.md"
  - ".planning/phases/07-433-a-pre-population/07-11-SUMMARY.md"
  - ".planning/phases/07-433-a-pre-population/07-12-PLAN.md"
  - ".planning/phases/07-433-a-pre-population/07-12-SUMMARY.md"
  - "app/package.json"
  - "app/scripts/build-433a-seed.mjs"
  - "app/scripts/lib/433a-mapping-rules.mjs"
  - "app/shared/questions.test.ts"
  - "app/shared/questions.ts"
  - "app/src/features/client-portal/intake/intake-api.test.ts"
  - "app/src/features/client-portal/intake/intake-api.ts"
  - "app/src/features/client-portal/intake/intake-copy.ts"
  - "app/src/features/client-portal/intake/intake-step.test.tsx"
  - "app/src/features/client-portal/intake/intake-step.tsx"
  - "app/src/features/client-portal/intake/question-control.test.tsx"
  - "app/src/features/client-portal/intake/question-control.tsx"
  - "app/src/features/client-portal/step-list.test.tsx"
  - "app/src/features/client-portal/step-list.tsx"
  - "app/src/features/financials/api.test.ts"
  - "app/src/features/financials/api.ts"
  - "app/src/features/financials/decide-dialog.tsx"
  - "app/src/features/financials/evidence-sheet.test.tsx"
  - "app/src/features/financials/evidence-sheet.tsx"
  - "app/src/features/financials/extract-button.test.tsx"
  - "app/src/features/financials/extract-button.tsx"
  - "app/src/features/financials/financials-header.tsx"
  - "app/src/features/financials/financials-page.test.tsx"
  - "app/src/features/financials/financials-page.tsx"
  - "app/src/features/financials/format.test.ts"
  - "app/src/features/financials/format.ts"
  - "app/src/features/financials/line-row.test.tsx"
  - "app/src/features/financials/line-row.tsx"
  - "app/src/features/financials/recommendation-rail.test.tsx"
  - "app/src/features/financials/recommendation-rail.tsx"
  - "app/src/features/financials/section-table.tsx"
  - "app/src/features/financials/source-badge.tsx"
  - "app/src/features/financials/test-fixtures.ts"
  - "app/src/features/financials/use-financials.ts"
  - "app/src/features/logics-push/api.ts"
  - "app/src/features/logics-push/logics-push-card.test.tsx"
  - "app/src/features/logics-push/logics-push-card.tsx"
  - "app/src/features/logics-push/use-logics-push.ts"
  - "app/src/features/requests/request-page.test.tsx"
  - "app/src/features/requests/request-page.tsx"
  - "app/src/routeTree.gen.ts"
  - "app/src/routes/admin/_shell/cases/$caseId/433a.tsx"
  - "app/tsconfig.app.json"
  - "app/vitest.config.ts"
  - "app/worker/src/db/bank.ts"
  - "app/worker/src/db/intake.ts"
  - "app/worker/src/db/logics-pushes.ts"
  - "app/worker/src/engine/determination.ts"
  - "app/worker/src/engine/financial-data.ts"
  - "app/worker/src/engine/intake-workflow.ts"
  - "app/worker/src/engine/outcome.ts"
  - "app/worker/src/engine/parity.test.ts"
  - "app/worker/src/engine/py.ts"
  - "app/worker/src/engine/resolution-path.ts"
  - "app/worker/src/engine/standards.ts"
  - "app/worker/src/engine/trace.ts"
  - "app/worker/src/extract/accounts.ts"
  - "app/worker/src/extract/bank-statement.ts"
  - "app/worker/src/extract/business.ts"
  - "app/worker/src/extract/classify.ts"
  - "app/worker/src/extract/fields.ts"
  - "app/worker/src/extract/housing.ts"
  - "app/worker/src/extract/merge.ts"
  - "app/worker/src/extract/parity.test.ts"
  - "app/worker/src/extract/parse.ts"
  - "app/worker/src/extract/pay-stub.ts"
  - "app/worker/src/extract/pdf-text.ts"
  - "app/worker/src/extract/transcript.ts"
  - "app/worker/src/extract/vehicle.ts"
  - "app/worker/src/financials/county.ts"
  - "app/worker/src/financials/db.ts"
  - "app/worker/src/financials/evaluate.ts"
  - "app/worker/src/financials/evidence.test.ts"
  - "app/worker/src/financials/evidence.ts"
  - "app/worker/src/financials/extract-proposals.test.ts"
  - "app/worker/src/financials/extract-proposals.ts"
  - "app/worker/src/financials/lines.ts"
  - "app/worker/src/financials/propose/address.test.ts"
  - "app/worker/src/financials/propose/address.ts"
  - "app/worker/src/financials/propose/bank.test.ts"
  - "app/worker/src/financials/propose/bank.ts"
  - "app/worker/src/financials/propose/cents.test.ts"
  - "app/worker/src/financials/propose/cents.ts"
  - "app/worker/src/financials/propose/logics.test.ts"
  - "app/worker/src/financials/propose/logics.ts"
  - "app/worker/src/financials/propose/payroll.test.ts"
  - "app/worker/src/financials/propose/payroll.ts"
  - "app/worker/src/financials/propose/run.ts"
  - "app/worker/src/financials/propose/window.test.ts"
  - "app/worker/src/financials/propose/window.ts"
  - "app/worker/src/financials/rpc.test.ts"
  - "app/worker/src/financials/rpc.ts"
  - "app/worker/src/financials/view.test.ts"
  - "app/worker/src/financials/view.ts"
  - "app/worker/src/index.ts"
  - "app/worker/src/integrations/bank/plaid/accounts.test.ts"
  - "app/worker/src/integrations/bank/plaid/accounts.ts"
  - "app/worker/src/integrations/bank/plaid/index.ts"
  - "app/worker/src/integrations/bank/provider.ts"
  - "app/worker/src/integrations/logics/fixtures.ts"
  - "app/worker/src/jobs/bank-reconcile.ts"
  - "app/worker/src/jobs/index.ts"
  - "app/worker/src/jobs/reconcile.test.ts"
  - "app/worker/src/jobs/reconcile.ts"
  - "app/worker/src/routes/admin-extract.ts"
  - "app/worker/src/routes/admin-financials.test.ts"
  - "app/worker/src/routes/admin-financials.ts"
  - "app/worker/src/routes/admin-worksheet.ts"
  - "app/worker/src/routes/c-address.test.ts"
  - "app/worker/src/routes/c-address.ts"
  - "app/worker/src/routes/c-intake.test.ts"
  - "app/worker/src/routes/c-intake.ts"
  - "app/worker/src/standards/bundle-repository.test.ts"
  - "app/worker/src/standards/bundle-repository.ts"
  - "app/worker/src/worksheet/layout.test.ts"
  - "app/worker/src/worksheet/layout.ts"
  - "app/worker/src/worksheet/render.test.ts"
  - "app/worker/src/worksheet/render.ts"
  - "app/worker/src/worksheet/store.ts"
  - "app/worker/src/worksheet/test-input.ts"
  - "app/worker/src/worksheet/text.ts"
  - "app/worker/test/bank-statements.test.ts"
  - "app/worker/test/connections-tracer.test.ts"
  - "app/worker/test/financials-api.test.ts"
  - "app/worker/test/financials-bank-payroll.test.ts"
  - "app/worker/test/financials-evidence.test.ts"
  - "app/worker/test/financials-extract.test.ts"
  - "app/worker/test/financials-propose.test.ts"
  - "app/worker/test/financials-rpc.test.ts"
  - "app/worker/test/fixtures/engine/golden-extract.json"
  - "app/worker/test/fixtures/engine/golden.json"
  - "app/worker/test/fixtures/financials.ts"
  - "app/worker/test/fixtures/plaid/accounts_get.json"
  - "app/worker/test/fixtures/portal-items.ts"
  - "app/worker/test/fixtures/truv/income_report_proposals.json"
  - "app/worker/test/intake-live.test.ts"
  - "app/worker/test/rls.test.ts"
  - "app/worker/test/standards-bundle.test.ts"
  - "app/worker/test/worksheet.test.ts"
  - "app/worker/tsconfig.json"
  - "src/tools/export_golden_fixtures.py"
  - "src/tools/golden_extract.py"
  - "supabase/migrations/0008_433a_prepopulation.sql"
  - "supabase/migrations/0009_433a_seed.sql"
covered_digest: "v3:sha256:3973002ed9625574196c68026b58dbc5cd1bc92c232b5285cca5a2e1604d32a8"
behavior_unverified: 5
overrides_applied: 1
overrides:
  - must_have: "the frozen src/frontend/ and docs/src/frontend/ are removed from the repository (07-08 truth 6, D-04)"
    reason: "Deliberately deferred to the user: vercel.json (merged from origin/main) builds and serves src/frontend/ for the teammate's Vercel deployment, and app/package.json live/deploy/secrets scripts still load src/frontend/.env. Removing it would break that deployment. The new app uses only app/shared/questions.ts, so FORM-02 is not affected."
    accepted_by: "orchestrator (user decision, recorded per verification instructions)"
    accepted_at: "2026-10-11T19:57:53Z"
behavior_unverified_items:
  - truth: "financial_value_decide action semantics (07-02 truth 2): accept/edit/known_zero/not_applicable/unknown/reject, case lock, case_not_found/bad_column/bad_value/proposal_stale"
    test: "pnpm -C app test:live:file worker/test/financials-rpc.test.ts against the test firm"
    expected: "8/8 pass; only the one column changes; stale proposals refused with proposal_stale"
    why_human: "Only a live test exercises the SQL function; running it writes test rows, which this verification was not allowed to do. SQL was read and is consistent."
  - truth: "financial_proposals_upsert keep/supersede/never-touch-decided rules and no 23505 under concurrency (07-02 truth 5)"
    test: "Same live suite (financials-rpc.test.ts)"
    expected: "Unchanged rows kept, changed rows superseded, accepted/edited/rejected untouched, two concurrent calls succeed"
    why_human: "State transition in SQL with no unit-level test; the live suite needs DB writes."
  - truth: "financials_propose job: per-source [] vs null semantics, transient retry, permanent failure logs financials.propose_failed while other sources still run (07-05 truth 1)"
    test: "pnpm -C app test:live:file worker/test/financials-propose.test.ts"
    expected: "7/7 pass"
    why_human: "run.ts has no unit test; the orchestration invariant is only exercised live."
  - truth: "Worksheet re-export is idempotent (200, same document_id, already: true, nothing new stored) (07-06 truth 4)"
    test: "pnpm -C app test:live:file worker/test/worksheet.test.ts"
    expected: "2/2 pass; one documents row and one Storage object per run"
    why_human: "Idempotency depends on the UNIQUE storage_key and Storage state; only the live test covers it."
  - truth: "Second extraction keeps unchanged document proposals and supersedes ones that no longer parse (07-12 truth 4)"
    test: "pnpm -C app test:live:file worker/test/financials-extract.test.ts"
    expected: "2/2 pass; second run kept 4, reject superseded 4"
    why_human: "Depends on the upsert SQL and Storage downloads; only the live test covers it."
human_verification:
  - test: "Run the nine Phase 7 live suites once against the test firm (financials-rpc, financials-api, financials-propose, financials-bank-payroll, financials-evidence, financials-extract, worksheet, intake-live, standards-bundle)"
    expected: "All pass; this upgrades the 5 behavior-unverified truths to verified"
    why_human: "They write fixture rows to the live database, which this verification was not allowed to do"
  - test: "Nicole and Sandra review the 433-A view layout (sections, chips, badges, inline row actions, 3/6 toggle) and the exported worksheet"
    expected: "Layout approved or overrides fed back to D-13/D-14/D-16"
    why_human: "Visual and workflow judgment (CONTEXT USER ACTION 1)"
  - test: "CPA/EA reviews plaid_category_map (130 rows) and truv_deduction_map (15 rows) line assignments"
    expected: "Line assignments signed off before any real case"
    why_human: "Domain judgment on 433-A line mapping (USER ACTION 2)"
  - test: "CPA/EA spot-checks three real-shaped cases: TS output vs their own calculation, including how the OIC result is shown (lump sum = NRE + 12 x Box F is stated in the reason text, not as a formula line) and that OIC returns needs_manual_review=false like the Python oracle"
    expected: "Figures agree; display of the OIC math accepted or a follow-up raised"
    why_human: "Professional review required before live use (USER ACTION 3; CLAUDE.md)"
  - test: "Andrew approves the disclaimer 'Screening worksheet — Not an IRS form' and picks the Logics FileCategoryID for worksheets"
    expected: "Wording approved; FileCategoryID confirmed or changed"
    why_human: "Client decision (USER ACTION 4)"
  - test: "Live Smarty check with a Hartford, Connecticut address once Smarty keys exist"
    expected: "Smarty county_fips is a planning-region code (09110-09190) that maps to an IRS county; an old-county code (09001-09015) shows Needs data"
    why_human: "Needs vendor keys not present in this environment (open question 4)"
  - test: "End-to-end UAT on the dev server or a deploy: client answers intake on a phone with prefill; staff open 433-A worksheet, accept values, run evaluation, export PDF (header and footer on every page), push in fake mode"
    expected: "Flow works; nothing offers a county choice; no official-IRS look"
    why_human: "Phone UX and visual check; the Worker was not deployed in this phase"
  - test: "Confirm the Worker evaluation should keep blocking on NULL facts rather than mirror Python case_api._screenable (which zero-fills 17 lines as an assumption)"
    expected: "Keep blocking (matches the CLAUDE.md NULL-vs-0 rule)"
    why_human: "Product/compliance decision raised by the 07-01 executor"
  - test: "Decide when to remove src/frontend/ and docs/src/frontend/ (move the env keys app/package.json loads from src/frontend/.env first; retire or repoint vercel.json)"
    expected: "User decision recorded"
    why_human: "Accepted deviation; affects the teammate's Vercel deployment"
---

# Phase 7: 433-A Pre-Population Verification Report

**Phase Goal:** As a ValorTax settlement officer, I want to review a 433-A worksheet pre-filled from connected bank, payroll, intake, and Logics data with IRS standards for the client's county, so that I only confirm values and read the recommendation instead of retyping the form.
**Verified:** 2026-10-11T19:57:53Z
**Status:** human_needed
**Re-verification:** No (initial verification)

## User Flow Coverage (MVP mode)

| Step | Expected | Evidence in codebase | Status |
|------|----------|----------------------|--------|
| Client answers intake | 23 client questions, one per screen, prefilled from Truv/Logics A-reliability | `step-list.tsx:146` mounts `IntakeStep`; `routes/c-intake.ts` GET/PUT/done; `db/intake.ts:50` `listPrefill` (A only, truv/logics); `logics.ts:45-47` married/age are A | VERIFIED |
| Data becomes proposals | Truv, Plaid, Logics, address, intake, document proposals with source and evidence | `propose/run.ts:35` PROPOSERS {address, logics, bank, payroll}; intake PUT writes source `intake`; `extract-proposals.ts` source `document`; enqueued from reconcile, address confirm, intake done, refresh | VERIFIED |
| Staff review pre-filled 433-A | Sections, chips, badges, competing proposals, drill-down | `routes/admin/_shell/cases/$caseId/433a.tsx`, `features/financials/*`, `GET .../financials/:column/evidence` | VERIFIED (layout: human) |
| Staff confirm values | Only accepted values enter `case_financial_data`; unknown stays NULL | Only writer is `financial_value_decide` (0008:132-205); Worker only reads `case_financial_data` (`financials/db.ts:54`); live DB: no column defaults on `case_financial_data` | VERIFIED |
| County standards, no dropdown | County from confirmed address FIPS | `county_fips_map` 3,230 rows, 0 unresolved, 06037 = Los Angeles County; no county select in `features/financials` | VERIFIED |
| Read the recommendation with its math | Path/reason verbatim, Box D/E/F, NRE lines, payment math | `recommendation-rail.tsx` renders run values only; `evaluate.ts` stores breakdown, NRE lines, standards inputs | VERIFIED |
| Export and push worksheet | PDF "Not an IRS form", pushed through the Phase 5 ledger | `worksheet/layout.ts:7-8,304`; `admin-worksheet.ts`; `db/logics-pushes.ts` lists `worksheet_433a` | VERIFIED |

The `[outcome]` clause ("only confirm values and read the recommendation instead of retyping the form") is supported by the code.

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Client answers intake in the redesigned portal, pre-filled from connected and Logics data; count reconciled against the 28 `question_definitions` rows (FORM-02) | VERIFIED | Live read-only query: 28 `question_id`s identical to the 28 ids in `app/shared/questions.ts`. Intake unit suites green (intake-step, question-control, intake-api, c-intake, shared/questions). Prefill limited to A-reliability Truv/Logics |
| 2 | 433-A view with income, expenses, assets, source badges, proposed vs confirmed, drill-down (FORM-03, FORM-07) | VERIFIED | `features/financials` (line-row, section-table, source-badge, evidence-sheet) plus `financials/evidence.ts` (bank, balances, payroll, intake, logics, address, staff, document). Mappings live in SQL: `plaid_category_map` 130, `truv_deduction_map` 15 (live). No category strings in `financials/*.ts` (guard test green) |
| 3 | Accept or edit each value; only accepted values enter `case_financial_data`; unknown stays unknown and blocks (FORM-04) | VERIFIED | Single SQL writer `financial_value_decide`. The Worker never writes the table. No defaults on its columns (live). `evaluate.ts:62-70` returns `information_needed` before any standards lookup or insert. 63 `null_*` golden cases prove the engine blocks on each NULL. SPA `formatValue` shows "Needs data", never $0 |
| 4 | County standards from the confirmed address, no dropdown; recommendation with math; TS engine matches Python golden fixtures, no constant changed (FORM-01, FORM-05, ADDR-02) | VERIFIED | `export_golden_fixtures.py --check` exit 0. Engine parity 165 cases (all 7 paths, OIC 9) with strict standards-call replay and `toEqual`. Python oracle files untouched by Phase 7 commits; 41 Python tests OK. Live `standards_bundle` returns LA 3001, Miami 423/'Miami', 0 vehicles gives 0/0/''. Connecticut rows 312/314/316/317 renamed, amounts identical to the seed |
| 5 | Worksheet PDF labeled "Not an IRS form", pushed to Logics like any document (FORM-06) | VERIFIED | `HEADER_TEXT`/`FOOTER_TEXT` stamped on every page (`layout.ts:304`, `layout.test.ts` asserts every page). Stored as `worksheet_433a`; `logics_push_create_batch` replaced to accept it; push card group `433-A worksheets` (logics-push-card tests green) |

### Plan must-haves (66 truths across 12 plans)

| Plan | Truths | Verified | Notes |
|------|--------|----------|-------|
| 07-01 engine + oracle | 7 | 7 | Freshness exit 0; parity green; purity block green. Decision tree moved to `resolution-path.ts` (documented re-port; the artifact tool's "missing export" on `determination.ts` is that move, and the exports exist there) |
| 07-02 migration 0008 | 8 | 6 + 2 PBU | Applied (`--status`), RLS on, 0 anon/authenticated grants on 6 tables and 0 EXECUTE grants on the 6 key functions (live). Decide and upsert semantics: PRESENT_BEHAVIOR_UNVERIFIED (live-only tests) |
| 07-03 seed 0009 | 5 | 5 | Live: 3,230 FIPS rows, 8 NULL (old CT), 0 unresolved, 9 distinct CT region amounts, 130 PFC, 15 Truv |
| 07-04 financials API | 5 | 5 | Routes mounted (`index.ts:75`); bundle repository tests (19) green; `insertDeterminationRun` writes `determination_runs` (`db.ts:94`) |
| 07-05 propose job | 6 | 5 + 1 PBU | Address/Logics proposers unit-tested; enqueue points found in reconcile, c-address, c-intake, refresh. `run.ts` orchestration: PBU |
| 07-06 worksheet | 5 | 4 + 1 PBU | Layout/render tests green; idempotent re-export: PBU |
| 07-07 Truv/Plaid | 6 | 6 | payroll/bank/accounts/reconcile unit tests green |
| 07-08 client intake | 6 | 5 + 1 override | `src/frontend/` removal: PASSED (override), see below |
| 07-09 staff view | 5 | 5 | Rail renders run values only; REVIEW sentence always shown (`NEXT_STEP` equals Python `_NEXT`) |
| 07-10 evidence | 5 | 5 | Unit + sheet tests green; https-only link guard |
| 07-11 extractors | 4 | 4 | golden-extract: 24 texts, 7 merges, 26 PDFs, 3 packets; parity green; no LLM path |
| 07-12 extract values | 4 | 3 + 1 PBU | kept/superseded on re-run: PBU |

**Score:** 66/71 truths verified (5 present, behavior-unverified; 1 PASSED via override).

### Accepted deviation (override)

| Truth | Status | Evidence |
|-------|--------|----------|
| `src/frontend/` and `docs/src/frontend/` removed (07-08, D-04) | PASSED (override) | `vercel.json` builds `src/frontend` (`npm --prefix src/frontend run build`, output `src/frontend/dist`). `app/package.json` scripts load `../src/frontend/.env`. Deferred to the user, as the orchestrator instructed. FORM-02 is unaffected |

### Required Artifacts

`verify.artifacts`: 07-02..07-12 all pass (59/59). 07-01 is 9/10: the tool expected `Determination`/`determineResolutionPath` in `determination.ts`; both are exported from `resolution-path.ts:15,29` after the documented split. Status: VERIFIED.

### Key Link Verification

`verify.key-links`: 36/38 matched by pattern. The two misses are indirection, checked by hand:

| From | To | Via | Status |
|------|----|-----|--------|
| `financials/evaluate.ts` | `determination_runs` | `insertDeterminationRun` in `financials/db.ts:94` | WIRED |
| `recommendation-rail.tsx` | `POST .../evaluations/:runId/worksheet` | `useExportWorksheet` → `api.ts:199 exportWorksheet` | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| RecommendationRail | run amounts | `determination_runs` row via `toRunView` | Engine output persisted per evaluation | FLOWING |
| LineRow / SectionTable | line values, proposals | `case_financial_data` + `financial_proposals` via `buildFinancialsView` | DB | FLOWING |
| EvidenceSheet | subtotals, average, stubs | `financial_bank_monthly` SQL, Truv report, proposal value | DB | FLOWING |
| IntakeStep | answers, prefill | `financial_proposals` (intake; truv/logics A) | DB | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Golden fixtures fresh vs Python oracle | `python src/tools/export_golden_fixtures.py --check` | exit 0 | PASS |
| Python oracle tests | `python -m unittest discover -s src/tests` | 41 OK | PASS |
| Phase 7 unit suites (engine, extract, financials, standards, worksheet, routes, intake, financials SPA, logics-push, request page) | `pnpm exec vitest run --project worker-node --project web <36 files>` | 36 files, 663 tests passed | PASS |
| Type check | `pnpm exec tsc -b` | exit 0 | PASS |
| 500-line gate | `node app/scripts/check-file-sizes.mjs` | exit 0 | PASS |
| Migrations applied | `node app/scripts/db-migrate.mjs --status` | 0008, 0009 listed | PASS |
| CT names fixed, amounts unchanged | read-only query vs `lookup_standards.seed.sql` | all 45 CT amounts identical; 4 names fixed | PASS |
| Bundle values | read-only `standards_bundle(...)` | LA 0-vehicle: housing 3001, operating 0, ownership 0, area ''; Miami: 423, 'Miami' | PASS |
| Live write tests | not run (would write to the live DB) | — | SKIP → human |

### Probe Execution

No probes are declared and no `scripts/*/tests/probe-*.sh` exist. Step 7c: N/A.

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|-------------|-------------|--------|----------|
| FORM-01 | 07-01 | SATISFIED | Golden parity, freshness gate, oracle untouched |
| FORM-02 | 07-08 (+05) | SATISFIED | Intake step, 28-row parity (live read) |
| FORM-03 | 07-05/07/09/10/12 | SATISFIED | View, badges, drill-down, document proposals |
| FORM-04 | 07-02/04/09 | SATISFIED (decide semantics: live run pending) | Single writer; unknown blocks |
| FORM-05 | 07-02/04/09 | SATISFIED | Bundle, strict repository, rail |
| FORM-06 | 07-06/09 | SATISFIED | Worksheet + push. **REQUIREMENTS.md still marks FORM-06 `[ ]` / Pending** (bookkeeping; orchestrator should tick it) |
| FORM-07 | 07-03/07 | SATISFIED | SQL maps, no category strings in TS |
| ADDR-02 | 07-02/03/05/09 | SATISFIED | FIPS map, address proposer, no dropdown |

No orphaned requirements.

### Test Quality Audit

| Test File | Linked Req | Skipped | Circular | Assertion | Verdict |
|-----------|-----------|---------|----------|-----------|---------|
| engine/parity.test.ts | FORM-01 | 0 | No (Python oracle, external) | Value (`toEqual`) + strict call replay | VALID |
| extract/parity.test.ts | FORM-03 | 0 | No (Python oracle, LLM off) | Value | VALID |
| worker/test/*live* (9 suites) | FORM-02..07 | `skipIf(!live)` (env-gated, project convention) | No | Behavioral | Not run here → human item 1 |

Disabled tests: 0. Circular: 0.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| Phase 7 files | TBD/FIXME/XXX | none found | — |
| `docs/` | 6 SPA test files (`api`, `evidence-sheet`, `financials-page`, `format`, `line-row`, `recommendation-rail` `.test`) have no own `.test.md`; each is documented in a "Tests" section of its module doc | Info | Convention differs from other folders |
| `.planning/REQUIREMENTS.md` | FORM-06 left Pending | Info | Bookkeeping |
| `CLAUDE.md`, `.claude/CLAUDE.md` | still say "32 questions" (code and DB have 28) | Info | USER ACTION 5 |

### Decision Coverage

All 20 trackable CONTEXT.md decisions are honored by the shipped artifacts (`check.decision-coverage-verify`: 20/20).

### Human Verification Required

1. **Live Phase 7 suites.** Run the nine live suites once against the test firm. This upgrades the 5 behavior-unverified truths.
2. **Nicole and Sandra layout review.** Review the 433-A view and the worksheet PDF.
3. **CPA/EA mapping review.** Review the `plaid_category_map` and `truv_deduction_map` line assignments.
4. **CPA/EA case review.** Check three real-shaped cases, including how the OIC math is shown and OIC's `needs_manual_review=false`.
5. **Andrew.** Approve the disclaimer wording and choose the worksheet `FileCategoryID`.
6. **Live Smarty Connecticut check.** Use a Hartford address to confirm planning-region versus old-county FIPS.
7. **End-to-end UAT.** Run the flow on dev or a deploy: phone intake, 433-A review, evaluation, PDF export (header and footer on every page), and a fake-mode push.
8. **`_screenable` decision.** Confirm the evaluation keeps blocking on NULLs instead of zero-filling.
9. **`src/frontend/` removal.** Decide on the removal and its timing (accepted deviation).

### Gaps Summary

There are no blocking gaps. All five roadmap success criteria are backed by code at HEAD and by green unit, parity and type checks. Read-only live DB checks confirm the migrations, seeds, Connecticut fix, standards bundle, RLS and the 28-question contract. Five SQL/Storage state-transition truths are only exercised by live tests that write to the database. They are routed to a human run, not marked verified. The deferred `src/frontend/` removal is recorded as an accepted user-decision deviation.

---

_Verified: 2026-10-11T19:57:53Z_
_Verifier: Claude (gsd-verifier)_
