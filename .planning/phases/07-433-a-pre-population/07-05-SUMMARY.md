---
phase: 07-433-a-pre-population
plan: 05
subsystem: worker, queue, api
tags: [financials, proposals, county, fips, smarty, logics, queue]
requires: [07-02 financial_proposals_upsert + cases.financials_settings, 07-03 county_fips_map, 07-04 financials routes/view/db, 06-01 address columns + verifyStreet]
provides:
  - "financials_propose queue job (runFinancialsPropose, PROPOSERS registry, ProposeContext, GENERATOR_VERSION 'p7-1')"
  - "address proposer (confirmed FIPS, old CT, not-in-IRS-table, manual/Logics fallback) and Logics proposer (married, age, liability)"
  - "cents.ts, window.ts helpers for Plan 07 bank/payroll proposers"
  - "POST /api/admin/cases/:id/financials/refresh; GET financials gains window, county, employers"
  - "address confirmation enqueues financials_propose"
affects: [07-07, 07-08, 07-09, 07-10]
key-files:
  created:
    - app/worker/src/financials/propose/{run,window,cents,address,logics}.ts (+ window/cents/address/logics tests)
    - app/worker/src/financials/county.ts
    - app/worker/test/financials-propose.test.ts
    - docs for each, plus docs/app/worker/src/routes/c-address.test.md
  modified:
    - app/worker/src/jobs/index.ts, app/worker/src/routes/admin-financials.ts (+ test), app/worker/src/routes/c-address.ts (+ test)
    - app/worker/src/financials/view.ts (+ test), app/worker/src/financials/db.ts
    - app/worker/src/integrations/logics/fixtures.ts
decisions:
  - "PROPOSERS is Record<name, Proposer> (not an array), so a failed or skipped source has a name for results and logs"
  - "Transient = ProviderError.transient or LogicsError network/upstream; jobs/index.ts uses the same isTransient for retry"
  - "financials_propose refs a case, so the queue never writes connection events for it (fail or DLQ)"
  - "The address fallback reads Logics CaseInfo only after the manual address fails to verify"
  - "Refresh merges into the raw financials_settings JSON (other keys kept) and answers settingsOf(merged)"
status: complete
duration: 46min
completed: 2026-10-11
actuals:
  tokens: 20200
  tasks: 3
  commits: 18  # measured on the shared tree; 3 are 07-05's (d03cfb9, 767affc, 1953913), the rest other executors'
plan_head_before: 394aa19bf58f616f05de8f9b5ff1fe95a4f6ae4c
plan_head_after: 8bca1b435d44d2ade7663868d2e4f5e09921e38e
---

# Phase 7 Plan 05: financials_propose job, address county and Logics proposals Summary

A new `financials_propose` queue job recomputes a case's proposals, one source at a time:

- **Address:** the IRS county comes only from a USPS FIPS. FIPS 06037 gives `Los Angeles County`.
- **Logics:** marital status, age and liability, re-read at job time. The raw text is never stored.

Three things trigger the job: a staff refresh, which also saves the 3/6-month window and the spouse employers; the client's address confirmation; and later plans. GET financials now returns a county status block, the window, and the payroll employers.

## Tasks
- Task 1 (tracer), `d03cfb9`: `run.ts`, `window.ts`, `county.ts`, the confirmed-Smarty branch of `address.ts`, and the `jobs/index.ts` dispatch. The live tracer passed (2/2). The tracer gate re-ran the verify and it passed, so execution continued (auto mode).
- Task 2, `767affc`: `logics.ts`, `cents.ts`, the manual-then-Logics fallback in `address.ts`, the Logics read in `run.ts`, and `FAKE_CASE_INFO_EXTRAS`. Unit tests passed 121/121 across `propose/` and `integrations/logics/`, including the Phase 2 mapper and lookup tests. Live passed 5/5.
- Task 3, `1953913`: the refresh route, the `county`/`window`/`employers` view fields, `loadCountyBlock`, `listCaseEmployers`, `saveFinancialsSettings`, and the `c-address` enqueue. Live passed 7/7. Routes, financials and jobs units passed 265/265.

## Facts the plan asked to record
- **Job type as merged:** `Job = webhook | reconcile | remove_item | LogicsPushJob | { type: 'financials_propose'; ref: <case id>; reason: 'connection_done' | 'address_confirmed' | 'intake_done' | 'refresh' }`.
- **Error classification:**
  - Transient errors are a `ProviderError` with `transient` (network, 429, 5xx) and a `LogicsError` `network`/`upstream`. The other sources still run. Then the first transient error is rethrown, and the queue retries the whole idempotent job with backoff.
  - Everything else is permanent. That source is `'failed'`, and the job logs `financials.propose_failed { source, code }` (system actor). `code` is our own token, e.g. `logics_unauthorized` or `http_400`.
  - `LogicsError('not_configured')` makes `logicsCaseInfo()` return `null`, so the `logics` source is skipped.
  - A missing case is `NonRetryableError('case_missing')`.
- **Fake CaseInfo extras:** for 900001 only, `{ DOB: '07/24/1980', MaritalStatus: 'Married', TaxLiability: '$18,450.00', Address: '100 Congress Ave', AptNo: '' }`. They are merged into `caseInfo` only, so the `find*` rows and the Phase 2 mapper are unchanged.
- **Smarty keys:** none in this environment. The Hartford live check (Open Question 5) was not run. The fallback is covered by unit tests with a stubbed `verifyStreet`. Without keys the address source is `'skipped'` when there is no confirmed Smarty address, so the county stays Needs data and no dropdown is shown.

## Deviations from Plan
1. [Rule 3] `PROPOSERS` is `Record<string, Proposer>` instead of `Proposer[]`. A throwing proposer has no returned `source`, so the key gives the name for the result and for `financials.propose_failed`. Plan 07 should add `bank: proposeBank, payroll: proposePayroll`.
2. [Rule 2] `jobs/index.ts` now retries a transient `LogicsError` too, through the shared `isTransient`. Before, only `ProviderError` retried. It also skips `recordConnectionEvent` for `financials_propose` on fail and in the DLQ, because its `ref` is a case id. The warn log uses `codeOf(e)`, which gives the same value for a `ProviderError`.
3. [Rule 3] The plan said the client session carries `case_id`. It does not. `c-address.ts` reads the case through the existing `sessionRequest(env, requestId, firmId)`, inside the same try/catch as the send.
4. [Rule 3] The new reads and the write went into `financials/db.ts` (`saveFinancialsSettings`, `listCaseEmployers`) and `county.ts` (`loadCountyBlock`), not into the route. `settingsOf` in `view.ts` is now exported for `run.ts`. `buildFinancialsView` takes `county`, `employers` and `now`, and the `view.test.ts` helper passes them.
5. [Rule 3] Live Logics test: `(firm_id, logics_case_id)` is unique, and other suites keep a test-firm 900001 case. The test reuses that case and deletes only its proposals, before and after. It seeds a fresh case when none exists.
6. I added extra unit tests: `address.test.ts` covers the confirmed CT and unmapped branches, refresh body 400s/404 are in `admin-financials.test.ts`, two enqueue tests are in `c-address.test.ts`, and a window/spouse test is in `view.test.ts`. I also added companion docs for those tests and for `window.test.ts`.

## Issues / notes
- `pnpm -C app run check` passed: sizes, golden fixtures, `tsc -b`, eslint (0 errors, 7 pre-existing warnings), and `pnpm test` (1756 passed, 221 skipped).
- `financials-api.test.ts` (07-04) failed once when run in parallel with `address-live` and `financials-propose`. It passed 3/3 alone and 19/19 when the trio was rerun, so it is likely a load flake. I did not investigate further.
- Without `JOBS` bound (`address-live.test.ts`), a confirmation writes one `financials.enqueue_failed` event. The client response is unchanged, and that suite passes.
- Requirements ADDR-02, FORM-02 and FORM-03 are also declared by unfinished plans (07-07..07-10, 07-12), so none were marked complete.

## Self-Check: PASSED
- All created code and doc files exist.
- `d03cfb9`, `767affc` and `1953913` are ancestors of HEAD.
- There are no stubs: the Task 1 placeholder in `readCaseInfo` was replaced in Task 2.
