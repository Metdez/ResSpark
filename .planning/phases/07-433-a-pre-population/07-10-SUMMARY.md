---
phase: 07-433-a-pre-population
plan: 10
subsystem: worker, admin-spa, financials
status: complete
tags: [433-a, evidence, drill-down, signed-urls, plaid, truv]
requires: ["07-07", "07-09"]
provides: [evidence-route, buildEvidence, evidence-sheet]
affects: ["07-12"]
tech-stack:
  added: []
  patterns: [proposal-source dispatch, SQL subtotals + capped row list, 300 s signed links, opener-ref focus return]
key-files:
  created:
    - app/worker/src/financials/evidence.ts
    - app/worker/src/financials/evidence.test.ts
    - app/worker/test/financials-evidence.test.ts
    - app/src/features/financials/evidence-sheet.tsx
    - app/src/features/financials/evidence-sheet.test.tsx
    - docs/app/worker/src/financials/evidence.md
    - docs/app/worker/src/financials/evidence.test.md
    - docs/app/worker/test/financials-evidence.test.md
    - docs/app/src/features/financials/evidence-sheet.md
  modified:
    - app/worker/src/routes/admin-financials.ts
    - app/src/features/financials/api.ts
    - app/src/features/financials/line-row.tsx
    - app/src/features/financials/section-table.tsx
    - app/src/features/financials/financials-page.tsx
    - docs for each modified file
decisions:
  - "The Plaid salary cross-check sits on payroll evidence as well as bank evidence, because wages only ever come from Truv"
  - "The payroll formula (sum, stubs, periods, monthly) is shown for the wage method only; deduction lines show their stubs and method"
  - "A Logics-address fallback shows only the FIPS and source label, because the Logics street is never stored"
  - "The SPA guard only lets https links into an href"
metrics:
  duration: ~26 min
  completed: 2026-10-11
estimate:
  tokens: 80000
  tasks: 2
actuals:
  tokens: 22700   # chars/4 over the added lines of this plan's 19 files
  tasks: 2
  commits: 3      # measured on the shared tree; 2 are 07-10's (d03467d, 8ef1b47), e619e4c is 06-08's
plan_head_before: 23a82cc171fb9c22b68bc638aa9e78dda321cad4
plan_head_after: 8ef1b47b6e154e1cfa6f8a3761f8c55d520cc484
---

# Phase 7 Plan 10: 433-A Evidence Drill-down Summary

Staff can click any figure on the 433-A worksheet, or any proposal value, to open a right-side Sheet that shows where it came from. The Sheet is fed by `GET /api/admin/cases/:id/financials/:column/evidence?proposal_id=` (behind staffAuth, scoped to the firm). For bank lines it lists each month's exact SQL subtotal and the transactions behind it. For payroll lines it lists every pay stub, the formula, and a 300-second signed link to the stub PDF. It also covers cash balances, intake answers, Logics fields, the USPS address with county and FIPS, staff entries, and documents.

## Evidence kinds implemented
`bank`, `balances`, `payroll`, `intake`, `logics`, `address`, `staff`, `document` and `none` (`No source yet`). If no proposal id is given, the route uses the confirming proposal (accepted or edited, newest decision), then the newest proposed one. A proposal id that does not belong to this case and column returns 404.

## Stub-document matching rule (observed against Phase 4 storage keys)
`storeProviderFile` stores Truv stubs at `firm/<f>/case/<c>/item/<i>/payroll/<company-slug>-<safeName(employer_id)>/paystub-<pay_date>[-<safeName(check)>].pdf` (from `employerSlug` and `collectEmployerFiles`). A stub ref `<connection_id>:<employer_id>:<pay_date>[:<check>]` matches the case's `pay_stub` document with the same `connection_id` whose `storage_key` ends with `-<employer_id>/paystub-<pay_date>[-<check>].pdf`. The live test uploads a stub at exactly that path and gets back a URL that contains `token=`. A stub with no stored PDF gets `document_url: null`.

## Commits
| Task | Commit | What |
|------|--------|------|
| 1 (tracer) | d03467d | `evidence.ts` with proposal resolution and bank evidence, the route, `getEvidence` and its guard, `EvidenceSheet`, figure buttons in `LineRow`, threaded through `SectionTable` to the page |
| 2 | 8ef1b47 | Every other source, pure helpers with unit tests, a renderer for each kind, the https-only link guard, docs |

## Test counts
- `worker-node worker/src/financials/evidence.test.ts`: 10 passed.
- `web src/features/financials`: 6 files, 34 passed. Six of these are new in `evidence-sheet.test.tsx`.
- Live `worker/test/financials-evidence.test.ts`: 5 passed, none skipped. Covered: bank, balances, payroll with a signed stub, intake/Logics/address/staff, and scoping/400/404.
- `pnpm -C app run check` at HEAD 8ef1b47: exit 0. 160 test files passed and 35 skipped; 1944 tests passed and 242 skipped. ESLint reported 0 errors and 9 warnings, all of which already existed.
- Tracer gate (auto mode): the Task 1 verify ran green before the commit, so execution expanded to Task 2.

## Deviations from Plan
1. **[Precondition note] `onOpenEvidence` was not in `line-row.tsx` yet.** 07-09 deliberately left it for this plan, as its summary and the orchestrator both say. This plan adds it, so the precondition was treated as met.
2. **[Rule 3] `section-table.tsx` (not in `files_modified`) passes `onOpenEvidence` through** to `LineRow`. Its doc was updated to match.
3. **[Rule 2] Focus return.** The Sheet has no `SheetTrigger`, so Radix's `onCloseAutoFocus` would not restore focus. The page records the clicked button through a third handler argument, `opener`, and the Sheet focuses it on close. `EvidenceSheet` gained two optional props: `returnFocus` (a ref) and `kind`, the line kind used to format values.
4. **Payroll view extended.** The contract was extended with `formula` (the must-have truth asks for sum, stubs, periods per year and monthly) and `cross_check`. The cross-check is on payroll as well as bank evidence because wage proposals only come from Truv; on bank views it is always `null` in practice.
5. **`buildEvidence` takes an optional `actor`.** This names the caller's own staff entries from the session, the same way `GET financials` does through `namesFor`.
6. **Pure helpers exported for unit tests:** `evidenceKind`, `windowMonths`, `payStubKeySuffix`, `crossCheckFrom`, `findStub` and `payrollFormula`. `evidence.ts` is 468 lines, under the 500-line limit.

## Known Stubs
None.

## Threat Flags
None beyond the plan's threat model:
- T-07-42: only 300-second signed URLs leave the Worker. Storage keys are never fields, and the SPA guard allows only https links.
- T-07-43: the case is read with `firm_id`. The proposal must match the case and column. Transactions, accounts, connections and documents are read only through the case's own connection ids or `case_id`.
- T-07-44: the transaction list is capped at 500 with a `truncated` flag, and subtotals come from SQL.
- No packages were installed.

## Self-Check: PASSED
- All created files exist. d03467d and 8ef1b47 are ancestors of HEAD.
