---
phase: 04-connect-payroll-bank
plan: 06
subsystem: ui
tags: [react, tanstack-query, shadcn, plaid, truv, staff-portal]
status: complete

requires:
  - phase: 04-connect-payroll-bank (04-02)
    provides: admin connection routes (list, refresh, transactions) and the ConnectionSummary projection
  - phase: 04-connect-payroll-bank (04-04)
    provides: bank statement month cells, transactions_update_status
  - phase: 03-uploads-review-live-status
    provides: StatusBadge + lib/status palette, documentUrl signed-URL route, pollInterval, ReviewPanel mount
provides:
  - Connections section on the staff request page (cards, mirrored badges, timestamps, Refresh)
  - accounts x 6 months statement grid with the Last 3 months / Months 4-6 split
  - 3/6-month transactions table with Plaid-sign money formatting
  - payroll employers panel with counts and document links
affects: [04-07, phase-04 verification, demo walkthrough]

actuals:
  tokens: 18216
  tasks: 2
  commits: 11
plan_head_before: ef7afb66b589578252415686e851c6a7f88d32d5
plan_head_after: 10d04dadd18ed67757e33e47af356b8d8ecbe415

tech-stack:
  added: []
  patterns:
    - "Connection cards mirror server status through pure mapping functions (connection-status.ts); the UI never infers a status"
    - "Client files open only via openSigned(documentUrl(id, 'inline')) in a noopener tab"

key-files:
  created:
    - app/src/features/review/connections/api.ts
    - app/src/features/review/connections/use-connections.ts
    - app/src/features/review/connections/connection-status.ts
    - app/src/features/review/connections/connections-panel.tsx
    - app/src/features/review/connections/connection-card.tsx
    - app/src/features/review/connections/statement-grid.tsx
    - app/src/features/review/connections/transactions-table.tsx
    - app/src/features/review/connections/payroll-panel.tsx
    - app/src/features/review/connections/money.ts
    - app/src/features/review/connections/open-signed.ts
  modified:
    - app/src/features/requests/request-page.tsx
    - docs/app/src/features/requests/request-page.md

key-decisions:
  - "Staff connection cards reuse the Phase 3 StatusBadge + lib/status Tone palette; the new mappings live in connection-status.ts"
  - "ToggleGroup is not vendored, so the 3/6-month toggle is two outline Buttons with aria-pressed"
  - "openSigned lives in its own module (not statement-grid.tsx) to satisfy react-refresh/only-export-components"

requirements-completed: [PAY-02, PAY-04, BANK-02, BANK-03, WEBH-02]

coverage:
  - id: D1
    description: "Connections section above the review panel: cards, mirrored badges, Last synced / Last webhook, Refresh"
    requirement: WEBH-02
    verification:
      - kind: unit
        ref: "app/src/features/review/connections/connections-panel.test.tsx"
        status: pass
  - id: D2
    description: "Statement grid with Last 3 months / Months 4-6 split and linked Statement/Uploaded cells"
    requirement: BANK-03
    verification:
      - kind: unit
        ref: "app/src/features/review/connections/statement-grid.test.tsx"
        status: pass
  - id: D3
    description: "3/6-month transactions table with inverted Plaid signs"
    requirement: BANK-02
    verification:
      - kind: unit
        ref: "app/src/features/review/connections/transactions-table.test.tsx"
        status: pass
  - id: D4
    description: "Payroll employers with counts and document links; zero documents reads No documents yet"
    requirement: PAY-02
    verification:
      - kind: unit
        ref: "app/src/features/review/connections/payroll-panel.test.tsx"
        status: pass

duration: ~45 min
completed: 2026-10-11
---

# Phase 4 Plan 06: Staff connection view Summary

**The staff request page now has a polled Connections section. Each bank or payroll card shows a badge that mirrors the server status, Last synced / Last webhook times, and a Refresh button. Bank cards add a 6-month statement grid split into last 3 / months 4–6 and a 3/6-month transactions table with Plaid signs inverted for display. Payroll cards list each employer with pay stub, W-2 and income report links.**

## Performance

- Tasks: 2/2. Plan commits: `9a1d204` (Task 1) and `bd0cd91` (Task 2). `commits: 11` in the frontmatter is the measured `rev-list` count since the plan base; 9 of those 11 belong to other executors (04-05, 06-02, 07-02, chore) that committed to `zack` in between.
- Verification: `vitest --project web src/features/review/connections` gives 7 files and 64 tests passing (api 6, connection-status 25, connections-panel 9, statement-grid 8, transactions-table 8, payroll-panel 5, money 4). `pnpm -C app build` is green. `check-file-sizes` is clean; the largest file is 173 lines. The full `pnpm -C app run check` passes (exit 0; 1514 tests passed, 197 skipped; 7 ESLint warnings, all pre-existing in files this plan did not touch).

## What was built

- `api.ts`: SPA mirrors of `ConnectionSummary` / `AccountSummary` / `MonthCell` / `EmployerView` / `TransactionRow`, with guards. Includes `fetchConnections`, `refreshConnection` and `fetchTransactions`.
- `use-connections.ts` provides three hooks:
  - `useConnections`: `['connections', id]`, `pollInterval`, `keepPreviousData`.
  - `useRefreshConnection`: invalidates `['connections', id]` and `['review', id]`.
  - `useTransactions`: enabled only while the disclosure is open.
- `connection-status.ts`: `connectionBadge`, `transactionsLine`, `cellBadge`, `employerBadge`, `employerCounts`. A bank that is still syncing reads `Syncing`, never a final 0.
- Components: `ConnectionsPanel`, `ConnectionCard`, `StatementGrid`, `TransactionsTable`, `PayrollPanel`. Helpers: `money.ts` (`formatMoney`) and `open-signed.ts`.
- Badge component: Phase 3's `StatusBadge` (`components/status-badge.tsx`) with the `Tone` palette from `lib/status.ts`.
- Toggle: `ToggleGroup` is not vendored, so the toggle is two `Button variant="outline"` with `aria-pressed`.
- Money outputs pinned by tests: `12.34` → `−$12.34`, `-50` → `+$50.00`, `0`/`null` → `$0.00`, `1234.5` → `−$1,234.50`.

Request-page hunk:

```diff
 import { ReviewPanel } from '@/features/review/review-panel'
+import { ConnectionsPanel } from '@/features/review/connections/connections-panel'
@@
             <MirrorCard requestId={d.id} />
+            <ConnectionsPanel requestId={d.id} />
             <ReviewPanel requestId={d.id} caseId={d.case.case_id} />
```

## Deviations from Plan

1. **[Rule 2 - Lint correctness] `openSigned` moved to `open-signed.ts`.** Exporting it from `statement-grid.tsx` triggered `react-refresh/only-export-components`. As a result, the literal `'noopener'` grep in Task 2's acceptance criteria is satisfied by `open-signed.ts`, not `statement-grid.tsx`. The grid and the payroll panel both still call `documentUrl(` directly.
2. **[Rule 2] Added `employerBadge(status)`.** The plan lists the employer badges (`Done`, `Needs attention`) but gives no mapping function for them. `connectionBadge('error')` would have read `Error`.
3. **[Rule 2] Added empty copy.** `No accounts yet` (bank card with no accounts) and `No employers yet` (payroll card with no employers), so an empty card is never blank.
4. **Extra docs.** Companion docs were also written for the 7 test files and for `open-signed.ts`, per the user's global documentation rule.
5. **Toggle styling.** The pressed window button is tinted `bg-accent` as well as carrying `aria-pressed`.

## Known Stubs

None.

## Self-Check: PASSED

- All 10 created source files exist under `app/src/features/review/connections/`. Commits `9a1d204` and `bd0cd91` are ancestors of HEAD.
