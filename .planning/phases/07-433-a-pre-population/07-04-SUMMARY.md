---
phase: 07-433-a-pre-population
plan: 04
subsystem: worker, api
tags: [hono, supabase, form-433a, standards, determination-runs]
requires: [07-01 TS engine, 07-02 migration 0008 + financials/rpc.ts]
provides:
  - "GET /api/admin/cases/:id/financials, POST .../financials/:column/decide, POST .../evaluations, GET .../evaluations/latest"
  - "BundleStandardsRepository + isStandardsBundle (app/worker/src/standards/bundle-repository.ts)"
  - "LINES/SECTIONS/labelFor/lineFor (financials/lines.ts), buildFinancialsView (view.ts), evaluateForCase/toRunView (evaluate.ts), db.ts reads"
affects: [07-05, 07-06, 07-09, 07-10]
key-files:
  created:
    - app/worker/src/standards/bundle-repository.ts
    - app/worker/src/standards/bundle-repository.test.ts
    - app/worker/src/financials/lines.ts
    - app/worker/src/financials/db.ts
    - app/worker/src/financials/view.ts
    - app/worker/src/financials/view.test.ts
    - app/worker/src/financials/evaluate.ts
    - app/worker/src/routes/admin-financials.ts
    - app/worker/src/routes/admin-financials.test.ts
    - app/worker/test/financials-api.test.ts
    - docs for each (docs/app/worker/...)
  modified: [app/worker/src/index.ts, docs/app/worker/src/index.md]
decisions:
  - "Caller's own display name comes from the verified staff session; other deciders from staff_profiles (firm-scoped)"
  - "listProposals also filters by firm_id (defense in depth); signature (env, firmId, caseId)"
  - "evaluateForCase takes an optional actorName so the 201 response carries created_by_name"
  - "Malformed case id answers 404 (not 400), same as a foreign case"
  - "calculation_trace is not stored on the run (determination_runs has no column for it)"
status: complete
duration: 25min
completed: 2026-10-11
actuals:
  tokens: 21500
  tasks: 2
  commits: 12  # measured on the shared tree; 2 are 07-04's (f2b7886, 472d272), the rest other executors'
plan_head_before: 360c8f388e12e7548994784c6a7b8896266c710d
plan_head_after: d79afde
---

# Phase 7 Plan 04: 433-A financials API Summary

Staff can now do three things through four staffAuth routes:

- Read every 433-A line with its status and the competing proposals.
- Confirm or edit a value through `financial_value_decide`.
- Evaluate the case with the TS engine against the county's standards.

Each evaluation is fetched once through `standards_bundle` and served by a strict `BundleStandardsRepository`. It is recorded as one insert-only `determination_runs` row that holds the math, the standards inputs and the engine version. When a fact is missing or a standard is unavailable, the route answers with labels only and writes nothing.

## Tasks
- Task 1 (tracer): `f2b7886`. Bundle repository, lines, db, view, evaluate, the route file, the mount in `index.ts`, the live tracer and docs. The tracer gate re-ran the live verify, which passed (auto mode).
- Task 2: `472d272`. Unit tests for the bundle repository (19), the view (10) and the routes (17), the two live edge cases, and the test docs.

## Facts the plan asked to record
- **PostgREST numerics:** `numeric(14,2)` comes back as **JSON numbers**. The live test asserts `typeof === 'number'` on `case_financial_data.gross_wages_taxpayer` and on `determination_runs.monthly_income`. The `Number()` coercion in `db.ts` and `toRunView` is kept as a guard only.
- **Mount pattern:** `app.route('/api/admin', adminFinancialsRoute)` sits after `adminEsignRoute` and before `adminLookupRoute`, which stays last. The router's own `.use('/cases/*', staffAuth)` handles auth. `staffAuth` skips when `staff` is already set, so sibling `/cases/*` routers such as admin-events do not verify twice.
- **Live test counts:** `financials-api.test.ts` passed 3/3: the tracer, `information_needed` for `age_spouse`, and `standards_unavailable` for `Nowhere County`. The unit tests (standards, financials, admin-financials) passed 50/50 across 4 files, including the existing `rpc.test.ts`.
- **Tracer result:** the live run's `path`, `reason` and `suggested_offer_or_payment` match an `evaluateCase` run in the test on the same live bundle and row. `standards_inputs.housing` is 3001. There is one run with `firm_id` set to the test firm and `created_by` set to the staff id, and one `evaluation.created` event whose payload is all strings.

## Deviations from Plan
1. [Rule 2] `listProposals` also filters by `firm_id`, so its signature is `(env, firmId, caseId)`. `evaluateForCase` takes an optional `actorName`. Both changes are additive.
2. [Rule 3] `by_name` for the caller comes from the session's `displayName`. The live test's mocked staff id has no `staff_profiles` row, because that table references `auth.users`. For any other staff member, the name still comes from `staff_profiles`.
3. Error-path mapping (400/404/409) was written in Task 1, alongside the route. Task 2 added the tests and the docs. There was no RED commit, as the orchestrator instructed.
4. I added companion docs for the three unit test files, which the plan's file list did not name. CLAUDE.md requires them.

## Issues / notes
- `pnpm -C app run check`: the size gate, freshness, `tsc -b` and eslint passed (0 errors and 7 warnings, all pre-existing). `pnpm test` had 1 failure out of 1857: `worker/src/jobs/logics-push-normalize.test.ts > is deterministic` (Phase 5). It passed 9/9 when rerun alone, so it looks like a timing flake in PDF hashing, outside this plan's files.
- `information_needed` lists the question ids first and then the columns, de-duplicated, as Python's `result_for_row` does. Each entry has its `LINES` label. Python's `_screenable` zero-fill is not applied (07-01-SUMMARY), so unknowns block.
- Requirements FORM-04 and FORM-05 are also declared by the unfinished plan 07-09, so they were **not** marked complete.

## Self-Check: PASSED
- All 10 code files and 12 docs exist.
- `f2b7886` and `472d272` are ancestors of HEAD.
- No TODO, FIXME or placeholder in the new files. The only `shortcut`-style note is the defensive `coerce` comment in `db.ts`.
