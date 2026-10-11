---
phase: 07-433-a-pre-population
plan: 02
subsystem: database, worker
tags: [supabase, migration, rpc, standards, 433-a]
requires: [0002 log_event, 0004 request_apply_status, 0006 logics_push_create_batch, 0007 address columns]
provides: [migration 0008, financials/rpc.ts, seedFinancialCase fixture]
affects: [07-03..07-12]
key-files:
  created: [supabase/migrations/0008_433a_prepopulation.sql, app/worker/src/financials/rpc.ts, app/worker/src/financials/rpc.test.ts, app/worker/test/fixtures/financials.ts, app/worker/test/financials-rpc.test.ts, app/worker/test/standards-bundle.test.ts]
  modified: [app/worker/test/rls.test.ts, docs/app/worker/test/rls.test.md]
decisions:
  - "D-05 checkpoint auto-selected option A (financial_proposals created as specified)"
  - "`unknown` with no proposal writes NULL and is recorded by its event only (proposed_value cannot be JSON null)"
  - "Fixture cleanup never deletes the case (events.case_id has no ON DELETE); a fresh case per seed"
status: complete
actuals:
  tokens: 19100
  tasks: 3
  commits: 11  # measured on the shared tree; 3 are 07-02's (30d7b3d, d8b581a, 2c6756a), the rest other executors'
plan_head_before: 15cb8b20d0ba11213156c1aa2e2ebd85a6b6cb67
plan_head_after: dbc38ea38df608df8438573d48d909508489aaaf
completed: 2026-10-11
---

# Phase 7 Plan 02: 433-A pre-population schema and decide path Summary

Migration 0008 (applied live) adds the proposals evidence trail, mapping/standards tables, the single-writer `financial_value_decide`, `financial_proposals_upsert`, SQL standards lookups + `standards_bundle`, `financial_bank_monthly`, `intake_submit`, and widens push eligibility for `worksheet_433a`. Typed Worker wrappers sit on top, and live tests cover every decide/upsert rule.

## Tasks
- Task 0 (decision, D-05): auto-selected A. No commit.
- Task 1 (tracer): `30d7b3d` migration + doc (applied, recorded in `app_migrations`); `d8b581a` rpc.ts, fixture, live tests. Tracer upsert → accept → one column → value-free event passes.
- Task 2: `2c6756a` rpc unit test, push-eligibility live test, rls.test.ts (5 tables + `rpc/financial_value_decide` probe).

## Facts the plan asked to record
- 0008 is **497 lines**; overflow valve **not used** (grants and RLS done in two `DO` loops, compacted formatting). `SET search_path = ''` count: 14.
- Connecticut mapping, verified by household-1 amount before the UPDATE: 312 → Lower Connecticut River Valley Planning Region (2388), 314 → Northeastern Connecticut Planning Region (2026), 316 → South Central Connecticut Planning Region (2359), 317 → Southeastern Connecticut Planning Region (2157). No `Region`/`Planning Region` row remains. Amounts unchanged.
- RAISE tokens: `case_not_found`, `bad_action`, `bad_column`, `bad_value`, `note_required`, `proposal_stale`, `bad_source`, `item_not_found`. The wrapper maps 23514 to `bad_value` and hides every other message as `financials_rpc_failed`.
- Live tests: financials-rpc 8/8, standards-bundle 4/4, rls 44/44, Phase 5 push suites (logics-rpc + logics-push) 19/19 against the replaced function; unit rpc.test 4/4.
- SQL smoke at apply time: role_routine_grants to PUBLIC/anon/authenticated = 0; RLS on all 5 new tables.

## Deviations from Plan
1. [Rule 1] Fixture `cleanup()` does not delete the case (plan said "then the case"): `events.case_id` has no ON DELETE and the orchestrator forbids deleting cases. It also deletes the case's Logics pushes/batches before documents.
2. [Rule 2] Added a live push-eligibility test (must_have truth for `worksheet_433a`, not in Task 2's behavior list).
3. The live tests for Task 2's behaviors landed in the Task 1 commit (`d8b581a`), since both files were written together; Task 2's commit holds the unit test, push test and rls changes.
4. `intake_submit` and `financial_bank_monthly` exist and are grant-checked but have no live behavior test here (their callers come in later plans).

## Issues / notes
- The first `standards_bundle` call right after applying 0008 returned an error once (hidden as `financials_rpc_failed`); every rerun passed. Likely the PostgREST schema cache reload.
- `pnpm -C app run check`: tsc fails only in `src/features/client-portal/connect/connection-api.ts` (another executor's uncommitted work); `pnpm test` fails only `worker/test/esign-start.test.ts` (06-02's). Lint and file sizes pass for 07-02 files.
- Requirements FORM-04..07 and ADDR-02 are also declared by later unfinished Phase 7 plans, so none were marked complete.

## Self-Check: PASSED
