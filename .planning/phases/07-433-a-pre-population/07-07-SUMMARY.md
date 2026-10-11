---
phase: 07-433-a-pre-population
plan: 07
subsystem: worker, financials, bank, payroll, queue
tags: [financials, proposals, truv, plaid, balances, reconcile]
requires: [07-02 financial_bank_monthly + financial_proposals_upsert, 07-03 plaid_category_map + truv_deduction_map, 07-05 PROPOSERS/ProposeContext/cents/window]
provides:
  - "truv source: proposePayroll (wages per person, mapped deductions, is_wage_earner, pay_frequency)"
  - "plaid source: proposeBank (SQL monthly averages behind a readiness gate, cash from depository balances)"
  - "Plaid /accounts/get adapter, optional BankProvider.accountBalances, updateAccountBalances, one balances call per bank reconcile"
  - "reconcileConnection enqueues financials_propose (connection_done) on an applied done for payroll/bank"
affects: [07-09, 07-10, 07-12]
key-files:
  created:
    - app/worker/src/financials/propose/{payroll,bank}.ts (+ tests)
    - app/worker/src/integrations/bank/plaid/accounts.ts (+ test)
    - app/worker/src/jobs/reconcile.test.ts
    - app/worker/test/financials-bank-payroll.test.ts
    - app/worker/test/fixtures/truv/income_report_proposals.json, app/worker/test/fixtures/plaid/accounts_get.json
  modified:
    - app/worker/src/financials/propose/run.ts, app/worker/src/integrations/bank/{provider,plaid/index}.ts
    - app/worker/src/db/bank.ts, app/worker/src/jobs/{bank-reconcile,reconcile}.ts
    - app/worker/test/{bank-statements,connections-tracer}.test.ts
decisions:
  - "is_wage_earner and pay_frequency count taxpayer employments only (they are taxpayer intake questions)"
  - "Cash proposal carries no window (point-in-time balance); skipped if any depository balance is null"
  - "A balances call that fails permanently (non-login) records connection.balances_failed and the sync continues; transient/login errors propagate"
  - "Signature connections never trigger financials_propose"
status: complete
duration: 45min
completed: 2026-10-11
actuals:
  tokens: 19800   # chars/4 over the added lines of this plan's files
  tasks: 3
  commits: 21     # measured on the shared tree; 4 are 07-07's (eb41ad0, 5ad15dc, c93fa85, 8822a38)
plan_head_before: 0e78497cfac28d71dc3e8d731d305f621887307f
plan_head_after: 8822a38a5867dc51dc76fcede16139e7e3372d27
---

# Phase 7 Plan 07: Truv and Plaid proposers, balances and the connection-done trigger Summary

Connected payroll and bank data now turn into proposals automatically. From Truv come gross wages per person, payroll deductions (mapped through `truv_deduction_map` rows), the wage-earner flag and the pay frequency. From Plaid come monthly averages summed in SQL, plus cash from `/accounts/get` balances. When a payroll or bank connection reaches `done`, `financials_propose` is enqueued for its case.

## Tasks
- Task 1 (tracer), `eb41ad0`: `payroll.ts` with its fixture, unit tests (10) and live tracer, and `payroll` added to `PROPOSERS`. The tracer gate re-ran the verify and it passed, so execution continued.
- Task 2, `5ad15dc`: `bank.ts` with the category guard, `accounts.ts`, `accountBalances` on the provider and Plaid adapter, `updateAccountBalances`, `syncBalances` in bank-reconcile, and `bank` added to `PROPOSERS`.
- Task 3, `c93fa85`: the `connection_done` enqueue in `reconcileConnection`, `reconcile.test.ts`, and a live reconcile → queue → proposals test.
- `8822a38`: type-check fixes in the three new test files (`fileURLToPath(...href)`, a non-null line). HEAD briefly failed `tsc -b` between `c93fa85` and this commit.

## Facts the plan asked to record
- **Fixture figures** (`income_report_proposals.json`, window 2026-07-01..2026-09-30):
  - Acme `BW` has 3 stubs × 2650.00. A fourth stub, dated 2026-06-30, is outside the window and ignored.
  - Beta `SM` has 2 stubs × 1800.00.
  - Wages are 9341.67 (Acme 5741.67 + Beta 3600.00). With `emp_2` as spouse, the taxpayer gets 5741.67, the spouse 3600 and `pay_frequency` is `biweekly`.
  - Taxes are 1410.92 (A): Acme 51273 × 3 × 26 / 36 = 111091.5 → 111092, plus Beta 30000.
  - Health is 260.00 (B), via `Medical PPO` matching `%medical%`. Life is 17.33 (C). Court-ordered is 433.33 (B). The 401(k) proposes nothing.
- **Live Plaid figures:** housing 1500, car 400, dividends 30 and cash 2500. The transfer, the pending row and the June row propose nothing.
- **Stored `transactions_update_status`:** bank-reconcile stores Plaid's raw value (`HISTORICAL_UPDATE_COMPLETE`, confirmed by `bank-statements.test.ts`). The proposer also accepts the mapped value `historical`.
- **`/accounts/get` billing (Assumption A4):** unknown. There are no Plaid keys here, so all vendor data was stubbed.
- **Live test counts:** `financials-bank-payroll` passed 3/3. `financials-propose` passed 7/7 after the `PROPOSERS` change. `bank-statements` passed 5/5. `connections-tracer`, `payroll-fetch` and `bank-complete` together passed 14/14.
- **Full check:** `pnpm -C app run check` passed: sizes, golden fixtures, `tsc -b`, eslint (0 errors, 9 pre-existing warnings), and the unit tests (1928 passed, 236 skipped).

## Deviations from Plan
1. [Rule 3] I split out a pure `payrollProposals(conns, map, window, spouseIds)` export so the unit tests need no database mock for the arithmetic. `NormBalance` is defined in `provider.ts` and re-exported from `accounts.ts`, so the provider contract does not import the Plaid adapter.
2. [Rule 1] The plan said `is_wage_earner` comes from "an employment" with stubs. It is proposed only from taxpayer employments, because a spouse-only paycheck must not make the taxpayer a wage earner.
3. [Rule 3] `bank-statements.test.ts` now stubs `/accounts/get`, so the new balances call never reaches the real Plaid host. Its cursor-only test expects `['/transactions/sync', '/accounts/get']`. `connections-tracer.test.ts` now expects the second `financials_propose` job after done. Both docs were updated.
4. A `syncBalances` login error (`PERMANENT_ITEM_ERRORS`) is rethrown, so the existing outer catch sets the `error` status. A database error is also rethrown, which means a queue retry.
5. I added companion docs for the new tests (`payroll.test.md`, `bank.test.md`, `accounts.test.md`, `reconcile.test.md`), which the plan did not list.

## Requirements
FORM-07 is marked complete. FORM-03 is also declared by the unfinished plans 07-10 and 07-12, so it was not marked.

## Self-Check: PASSED
- All created code, fixture and doc files exist.
- `eb41ad0`, `5ad15dc`, `c93fa85` and `8822a38` are ancestors of HEAD.
- There are no stubs. No category string appears in any `financials/` source file; the guard test enforces this.
