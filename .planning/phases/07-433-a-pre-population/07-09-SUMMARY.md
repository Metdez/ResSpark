---
phase: 07-433-a-pre-population
plan: 09
subsystem: admin-spa
status: complete
tags: [433-a, financials, staff-ui, recommendation, county]
requires: ["07-04", "07-05", "07-06"]
provides: [433a-route, financials-feature, line-row, financials-header, recommendation-rail]
affects: ["07-10", "07-12"]
tech-stack:
  added: []
  patterns: [guarded api client, mounted-on-open dialog, sequential mutateAsync bulk accept, run-only rendering]
key-files:
  created:
    - app/src/routes/admin/_shell/cases/$caseId/433a.tsx
    - app/src/features/financials/api.ts
    - app/src/features/financials/use-financials.ts
    - app/src/features/financials/format.ts
    - app/src/features/financials/source-badge.tsx
    - app/src/features/financials/line-row.tsx
    - app/src/features/financials/decide-dialog.tsx
    - app/src/features/financials/section-table.tsx
    - app/src/features/financials/financials-header.tsx
    - app/src/features/financials/financials-page.tsx
    - app/src/features/financials/recommendation-rail.tsx
    - app/src/features/financials/test-fixtures.ts
  modified:
    - app/src/routeTree.gen.ts
    - app/src/features/requests/request-page.tsx
    - app/src/features/requests/request-page.test.tsx
decisions:
  - "Not applicable sends a note only; the decide RPC picks the not-applicable value (0/false/\"not_applicable\"/[]), so the SPA never chooses it"
  - "The rail's last Run evaluation attempt wins: information_needed or standards_unavailable hides the older run's amounts"
  - "proposal_stale is handled once in useDecide (toast + refetch), shared by row actions and bulk accept"
metrics:
  duration: ~45 min
  completed: 2026-10-11
estimate:
  tokens: 130000
  tasks: 3
actuals:
  tokens: 26000
  tasks: 3
  commits: 3
plan_head_before: ef853d577c7822f76580ed085eab74885e4a92a6
plan_head_after: c93fa85b4343511ca7df586f5e081ba61af2a008
---

# Phase 7 Plan 09: Staff 433-A View Summary

Staff 433-A worksheet at `/admin/cases/$caseId/433a`: the seven sections from the Worker's view with source badges, chips and competing proposals; every decide action (Accept, Reject, Edit with a note, Known $0, Unknown, Not applicable); section bulk accept; the 3/6 month window and Refresh; the county state taken only from the address; employer Taxpayer/Spouse assignment; and a sticky rail that shows the engine's run as stored, runs the evaluation and exports the worksheet.

## Component tree

```
routes/admin/_shell/cases/$caseId/433a.tsx  (Header + Main chrome)
└─ FinancialsPage                          useFinancials (5 s poll), useLatestEvaluation
   ├─ FinancialsHeader                      n of m, 3/6 toggle, window dates, Refresh proposals, actions slot
   ├─ SectionTable × 7                      collapsible Card + Table, Accept all proposed in this section
   │  ├─ CountyRow (Household)              display only, no picker
   │  ├─ Employers (Employment)             Taxpayer / Spouse -> refresh { spouse_employer_ids }
   │  └─ LineRow × n                        value, chip, caption, proposals (Accept/Reject), Edit/Known $0/Unknown/Not applicable
   │     └─ DecideDialog                    Edit (value + note) or Not applicable (note)
   └─ aside > RecommendationRail            label, path, reason, flags, review note, Box D/E/F, NRE lines, suggested amount + payment math, context, Run evaluation, Export worksheet PDF
```

## Commits

| Task | Commit | What |
|------|--------|------|
| 1 (tracer) | 7f34915 | Route, typed client and guards, hooks, format, badges, rows with Accept, sections, request-page link |
| 2 | a4fc96a | Every decision action, dialog, bulk accept, header, county block, employers |
| 3 | 16c751c | Recommendation rail mounted in the page |

The branch is shared, so `git rev-list --count plan_head_before..HEAD` is 18 (other executors' commits included); `commits: 3` is `git rev-list --count --grep='(07-09)'` over the same range.

## Verification

- `pnpm -C app exec vitest run --project web src/features/financials src/features/requests`: green (financials 28 tests; full `web` project 77 files, 681 tests).
- `pnpm -C app exec vite build`: green; `routeTree.gen.ts` regenerated with only the `433a` hunks.
- `pnpm -C app run check`: stops at `tsc -b` on errors only in other executors' uncommitted files (`worker/src/financials/propose/bank.test.ts`, `payroll.test.ts`, `worker/test/financials-bank-payroll.test.ts` from 07-07; `src/features/requests/requests-api.test.ts` modified in the working tree). `tsc -b` shows no errors in 07-09 files; eslint on the 07-09 files: 0 errors, 2 `react-refresh/only-export-components` warnings (same pattern as the other route files).
- Tracer gate (auto): tests and build re-run after Task 1, then expanded.

## Deviations from Plan

1. **[Rule 3 - Blocking] `request-page.test.tsx` mocks `@tanstack/react-router`.** The new typed `Link` needs a router, and the page test renders without one. The mock turns `Link` into an `<a>`; the test that checks the `433-A worksheet` link lives there, not in `financials-page.test.tsx`.
2. **[Rule 2 - Test support] `test-fixtures.ts` added** (with its doc), shared by the four web test files.
3. **No nested `<main>`.** The route's `Main` is already the page landmark, so the page grid is a `div`.
4. **`onOpenEvidence` prop left out of `LineRow`.** Plan 10 adds it with the evidence Sheet; adding an unused prop now would be speculative.
5. **Section titles come from the Worker** (`Household`, `Tax liability`), not the longer D-14 names. The SPA renders the view as given.
6. **Line 42 (out-of-pocket health) shows no IRS standard cell.** The bundle keeps two health amounts (under and over 65); choosing one by age would be a calculation in the SPA. The Allowed cell still shows the engine's amount.
7. **`Unknown` shows only when a value is set**, because an unknown line has nothing to clear.

## UI-SPEC notes

- Money uses `Intl.NumberFormat` USD, right-aligned with `tabular-nums`; header rows use `bg-muted`; chips and badges use `TONE_CLASSES`; actions are small outline buttons whose `aria-label` names the line.
- The dialog footer uses a 16 px gap between Cancel and Save.
- Row actions are inline buttons, not the dense-table `DropdownMenu`, because D-14 asks for Accept / Edit / Known $0 / Unknown on each row. Nicole and Sandra should confirm this.

## End-of-phase UAT notes (human check, not run here)

On `pnpm -C app dev` with a fake-mode case (test firm `00000000-0000-0000-0000-00000000000e`): open the request, then `433-A worksheet`; accept a few proposals; run the evaluation; check the rail's Box D/E/F and NRE lines against the sections; export the worksheet and follow `Push it from the request page`. Confirm the layout at 1280 px and that nothing offers a county choice. Nothing was deployed.

## Known Stubs

None.

## Threat Flags

None. All rendering is React text (no `dangerouslySetInnerHTML`), every response passes a guard (T-07-39), values travel only in JSON bodies (T-07-40), and edits and not-applicable decisions require a note (T-07-41). No packages were installed.

## Self-Check: PASSED

- Files: the route, the 12 `features/financials` source files (including tests and fixtures), and the 13 docs exist.
- Commits 7f34915, a4fc96a and 16c751c are ancestors of HEAD.
