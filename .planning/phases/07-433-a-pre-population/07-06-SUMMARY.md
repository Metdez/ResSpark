---
phase: 07-433-a-pre-population
plan: 06
subsystem: worker, api, ui
tags: [pdf-lib, worksheet, form-433a, logics-push, supabase-storage]
requires: [07-04 RunView/toRunView/LINES/determination_runs, 07-02 migration 0008 push eligibility for worksheet_433a, Phase 5 push card and ledger]
provides:
  - "POST /api/admin/cases/:id/evaluations/:runId/worksheet (201 / 200 already / 404 / 409) and GET /api/admin/cases/:id/worksheets"
  - "worksheet/{text,layout,render,store}.ts: WinAnsi sanitizer, two-pass Letter layout with the disclaimer on every page, pdf-lib render, idempotent documents row"
  - "listPushableDocuments includes the request case's ready worksheet_433a documents; push card group '433-A worksheets' (useWorksheets)"
affects: [07-09, 07-10]
key-files:
  created:
    - app/worker/src/worksheet/text.ts
    - app/worker/src/worksheet/layout.ts
    - app/worker/src/worksheet/render.ts
    - app/worker/src/worksheet/store.ts
    - app/worker/src/worksheet/test-input.ts
    - app/worker/src/worksheet/layout.test.ts
    - app/worker/src/worksheet/render.test.ts
    - app/worker/src/routes/admin-worksheet.ts
    - app/worker/test/worksheet.test.ts
    - docs for each (docs/app/worker/...)
  modified:
    - app/worker/src/index.ts
    - app/worker/src/db/logics-pushes.ts
    - app/src/features/logics-push/{api.ts,use-logics-push.ts,logics-push-card.tsx,logics-push-card.test.tsx}
    - docs/app/worker/src/{index,db/logics-pushes,routes/admin-logics-push}.md, docs/app/src/features/logics-push/{api,use-logics-push,logics-push-card}.md
key-decisions:
  - "The documents row is inserted as 'uploading' before rendering; the UNIQUE storage_key decides a concurrent export (409 while in flight), and any failure removes the object and row"
  - "A re-export reads its page count from the worksheet.generated event; no new column"
  - "The health standard column shows the bundle's two per-person rates; every allowed and total amount is the run's own value"
  - "A confirmed value with no recorded decision prints 'Not recorded' as its source"
status: complete
duration: 37min
completed: 2026-10-11
actuals:
  tokens: 20700
  tasks: 3
  commits: 17  # measured on the shared tree; 3 are 07-06's (a60bd8b, e2d5233, 8bca1b4), the rest other executors'
plan_head_before: e7922775b8fe0f7ce5a5ca1d836aa889d9f4dd5d
plan_head_after: 8bca1b435d44d2ade7663868d2e4f5e09921e38e
---

# Phase 7 Plan 06: 433-A screening worksheet export and push Summary

Staff can now export a stored run as a US Letter screening-worksheet PDF. Every page carries `Screening worksheet — Not an IRS form` and the numbered `Prepared by ResSpark ... Do not file. Page N of M` footer. The PDF is stored in `case-documents` as a hashed `worksheet_433a` document and is idempotent per run. It can be pushed to Logics from the existing push card through the same ledger.

## Tasks
- Task 1 (tracer): `a60bd8b`. Text, layout, render, store, route, mount and the live tracer. The tracer gate re-ran the live verify, and it passed (auto mode).
- Task 2: `e2d5233`. Full content: every D-14 section from the snapshot with its source, the expense table (Actual | IRS standard | Allowed | Source), Box D/E/F, the seven NRE lines and their total, payment math and flags. Includes the unit tests.
- Task 3: `8bca1b4`. Push eligibility in `listPushableDocuments`, `listWorksheets`/`useWorksheets`, the `433-A worksheets` card group, card tests and the live fake-mode push.

## Facts the plan asked to record
- **Live sample page count:** 3 pages, 21,522 bytes (LA County golden row, household 1). The Task 1 thin layout was 1 page.
- **`sections.ts` split:** not split. `layout.ts` is 311 lines.
- **Push route change:** none. `admin-logics-push.ts` only re-checks `item_status`, size and hash on what `listPushableDocuments` returns, so worksheets are listed as `item_status 'approved'` and pass unchanged. Its doc now says so.
- **Fake-mode push result:** `POST /requests/:id/logics-push` with the case's worksheet returned 202 `mode: 'fake'`, created one `queued` `logics_pushes` row for that document and sent one queue message. Another case's worksheet returned 422 `not_pushable`.

## Deviations from Plan
1. [Rule 2] A failed export removes its object and its `uploading` row, so the next click starts clean. The plan described only the happy path.
2. [Rule 3] The live tests needed a 30 s timeout (default 5 s), because each export evaluates and renders live.
3. I added docs for `test-input.ts`, `layout.test.ts` and `render.test.ts`, which CLAUDE.md requires but the plan's file list did not name. `test-input.ts` is a shared unit-test fixture that the plan did not list.
4. Probe: `@cantoo/pdf-lib@2.11.1` does **not** throw on CJK text, contrary to RESEARCH Pattern 6. Its output for those characters is undefined, so the `toWinAnsi` sanitizer is kept to make the output deterministic.

## Verification
- `vitest --project worker-node worker/src/worksheet`: 11/11 passed. `--project web src/features/logics-push`: 32/32 passed. `admin-logics-push.test.ts`: 18/18 passed.
- Live `worker/test/worksheet.test.ts`: 2/2 passed (test firm `…000e`; PDFs removed, fixtures cleaned, cases kept).
- `pnpm -C app run check`: exit 0. That covers sizes, golden freshness, `tsc -b`, eslint (0 errors, 7 pre-existing warnings), and 1756 passed / 221 skipped.

## Pending human checks
- Open an exported PDF on the dev server or the deployed app and confirm the header and footer on every page, and that nothing looks like an official IRS form. Nothing was deployed.
- Nicole and Sandra review the worksheet layout. Andrew approves the disclaimer wording (USER ACTION 4).

## Notes
- FORM-06 is also declared by unfinished plan 07-09, so it was not marked complete.

## Self-Check: PASSED
- All 9 code files and their docs exist. `a60bd8b`, `e2d5233` and `8bca1b4` are ancestors of HEAD.
