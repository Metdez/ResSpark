# `app/worker/src/financials/evidence.test.ts`

Unit tests (`worker-node` project, no database) for the pure helpers of `evidence.ts`. Run with `pnpm -C app exec vitest run --project worker-node worker/src/financials/evidence.test.ts`.

| Block | Checks |
|-------|--------|
| `row(over)` | A `financial_bank_monthly` row, informational `gross_wages_taxpayer` by default. |
| `parsePayStubRef` | `c1:emp_1:2026-09-15` parses with a null check number; `:1001` adds check `1001`; an empty id, two parts, a non-ISO date, an empty employer, a trailing empty check and five parts are `null`. `payStubKeySuffix` gives `-emp_1/paystub-2026-09-18-3003.pdf` and `-emp_2/paystub-2026-09-15.pdf`, the Phase 4 file names. |
| `evidenceKind` | Plaid cash is `balances`, other Plaid lines `bank`; `truv` is `payroll`; intake, logics, address, staff and document map to themselves; an unknown source is `none`. |
| `crossCheckFrom` | Two salary rows (3000.00 and 3000.01) over 3 months give `Plaid salary deposits (net, cross-check only)` at 2000 a month; expense rows are ignored; no salary rows, or a non-wage column such as `net_business_income`, gives `null`. |
| `windowMonths` | Jul to Sep 2026 lists three months; Nov 2025 to Apr 2026 crosses the year end with six. |
| `findStub` / `payrollFormula` | A stored report with three BW stubs: the 2026-09-18 stub reads `Acme Inc`, 265000 cents, `BW`; a ref without the check number finds nothing; a malformed gross reads `null`. The formula over the three stubs skips the malformed one: sum 5300, 2 stubs, 26 periods, 5741.67 a month. |
