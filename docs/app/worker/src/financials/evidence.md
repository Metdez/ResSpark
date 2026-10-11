# `app/worker/src/financials/evidence.ts`

The evidence behind one 433-A figure (D-09, D-10, FORM-03). `GET /api/admin/cases/:id/financials/:column/evidence` (see `routes/admin-financials.md`) calls `buildEvidence`, and the staff SPA shows the result in the right-side evidence Sheet (`features/financials/evidence-sheet.tsx`). Every read is scoped by firm and case. Bank subtotals come from SQL (`financial_bank_monthly`); other amounts come from the stored proposal, except the payroll formula, which repeats the proposer's arithmetic per employer so staff can check it.

## Types

| Type | Meaning |
|------|---------|
| `BankTxn` | One transaction row: id, date, name, merchant, amount (positive; inflows are sign-flipped like the SQL aggregate) and the account label `{name} ••{mask}`. |
| `CrossCheck` | `{ label, monthly }` or `null`. |
| `EvidenceView` | One variant per `kind`, all with `column`, `label` and `proposal_id` except `none`. `bank`: window, months with exact subtotals and their transactions, the average (the proposal value), `truncated`, `cross_check`. `balances`: each account (label, type, subtype, current balance, as-of time) and the total (the proposal value). `payroll`: window, stubs (employer, pay date, gross, frequency, signed stub URL or `null`), `formula` per employer, `method`, `value`, `cross_check`. `intake`: question prompt, answer, answered-at. `logics`: field, value, fetched-at. `address`: USPS address parts, county, FIPS, and the ref label as `source`. `staff`: who, when, note, value. `document`: documents with signed URLs. `none`: the line has no proposal yet. |
| `EvidenceProposal` | The proposal columns this module reads (`SELECT`). |
| `MonthlyRow` | One row of `financial_bank_monthly`. |
| `PayStubRef`, `Stub` | A parsed pay-stub ref, and the stub it points at (employer, gross in cents, Truv frequency code). |

## Constants

| Constant | Value |
|----------|-------|
| `MAX_TRANSACTIONS` | 500. At most 500 transactions are listed; `truncated` says more exist (T-07-44). The subtotals still include every transaction because they come from SQL. |
| `SIGNED_URL_SECONDS` | 300, the Phase 3 signed-URL lifetime. `sign()` passes `expiresIn: 300` to `signedReadUrl` (T-07-42). |
| `CROSS_CHECK_LABEL` | `Plaid salary deposits (net, cross-check only)`. |

## Pure helpers (unit-tested)

| Helper | What it does |
|--------|--------------|
| `evidenceKind(p)` | `plaid` opens `balances` for `cash_and_bank_balances` and `bank` otherwise; `truv` opens `payroll`; `intake`, `logics`, `address`, `staff` and `document` open their own kind; anything else opens `none`. |
| `parsePayStubRef(id)` | `<connection_id>:<employer_id>:<pay_date>[:<check_number>]` (the ref `propose/payroll.ts` writes) to its parts; a wrong part count, an empty part or a date that is not `YYYY-MM-DD` gives `null`. |
| `payStubKeySuffix(ref)` | The end of the stored stub's storage key: `-{safeName(employer_id)}/paystub-{pay_date}[-{safeName(check)}].pdf`. This is the Phase 4 rule: `storage/connection-files.ts` names the folder `{company slug}-{employer_id}` and `integrations/truv/reports.ts` names the file `paystub-{pay_date}[-{check}].pdf`. |
| `crossCheckFrom(rows, column, months)` | Only for wage columns (`gross_wages_*`): the `informational` rows mapped to that column (the `INCOME_SALARY` / `INCOME_WAGES` categories in `plaid_category_map`), summed and divided by the window's months, half up. No such rows gives `null`. Net deposits are a cross-check only and never a wage proposal (D-09). |
| `windowMonths(start, end)` | `YYYY-MM-01` for every calendar month the window touches, oldest first (capped at 24). A month with no rows still appears with a `0` subtotal, so staff see what the average divides by. |
| `findStub(data, ref)` | The statement in the connection's stored income report (`data.employers[].report.employments[].statements[]`) with the ref's employer, pay date and check number, matched the way the proposer matched it. Its gross is parsed to cents (`null` when malformed, never guessed); employer is the employment's company name, else the employer's `company_name`. Not found gives a stub with nulls. |
| `payrollFormula(stubs)` | Per connection and employer: the gross sum, the number of stubs, periods per year (52/26/24/12 from the Truv code) and `sum × periods ÷ (stubs × 12)` half up, the proposer's own formula. Stubs without a gross or a usable frequency are left out. |

## `buildEvidence(env, { firmId, caseId, column, proposalId, actor? })`

1. Reads the case with `firm_id` (T-07-43). A missing or foreign case gives `null` (the route answers 404).
2. `pickProposal`: with a proposal id, that row only when it belongs to the firm, case and column (any status); otherwise `null` (404). Without one: the confirming proposal (`accepted` or `edited`, newest `decided_at`), else the newest `proposed` row. No proposal gives `{ kind: 'none', column, label }`.
3. Dispatches by `evidenceKind`. The label is `labelFor(column)` from `lines.ts`.

| Kind | Reads |
|------|-------|
| `bank` (`bankEvidence`) | `bankScope`: the case's bank connections, with the same filter as `financial_bank_monthly` (firm, case, `kind = 'bank'`, not `removed`). The per-month subtotal is the sum of the SQL rows for this column with treatment `income` or `expense` (cents, divided by 100 once). The categories mapped to the column come from `plaid_category_map` rows (data, never literals in code). Transactions are read per treatment through the case's connection ids only: non-pending, in the window, in those categories, with the same sign rule as the SQL (`income` needs `amount < 0` and is shown as `-amount`; `expense` needs `amount > 0`). Each query is ordered by date (newest first) and limited to 501, so the merge knows when more than 500 exist. Account labels come from `bank_accounts` (`name ••mask`). The cross-check comes from the same SQL rows. |
| `balances` (`balancesEvidence`) | The `bank_account` refs, read from `bank_accounts` only within the case's bank connections, so a ref id from elsewhere matches nothing. Label `name ••mask`, type, subtype, `balance_current`, `balance_as_of`. `total` is the proposal value. |
| `payroll` (`payrollEvidence`) | Parses each `pay_stub` ref (connection ids must be UUIDs). Reads the referenced connections with firm, case and `kind = 'payroll'`, then their `pay_stub` documents of this case. Each stub comes from `findStub`; its document is the one of the same connection whose storage key ends with `payStubKeySuffix(ref)`, signed for 300 seconds, else `null`. Stubs are listed newest first; frequency reads `weekly`/`biweekly`/`semimonthly`/`monthly` (the raw code otherwise). `formula` is `payrollFormula` for the wage method `mean_gross_pay_x_periods_div_12` and empty for deduction lines (their per-stub deduction amounts are not repeated here). A wage column with a window adds the Plaid cross-check from `financial_bank_monthly`. |
| `intake` | Prompt from `QUESTION_BY_ID` (`app/shared/questions.ts`; the label when the column is not a question), the answer (`proposed_value`), answered-at (`created_at`). |
| `logics` | The `logics_field` ref id as the field (`TaxLiability`, `DOB`, `MaritalStatus`), the derived value as proposed, fetched-at (`created_at`). The raw Logics text is never stored, so it is not shown (Phase 2 C8/M6). |
| `address` (`addressEvidence`) | For an `address` ref: the case's address columns (line 1, line 2, city, state, ZIP). For a Logics-address fallback (`logics_field` ref) the street is not stored, so the address parts are `null`. The FIPS comes from the ref label (`county FIPS 06037`), else the case's `county_fips`; the county is the proposed value for `county_of_residence`, else the case's county name. `source` is the ref label. |
| `staff` | `decided_by`'s display name (the signed-in `actor` by session name, others from `staff_profiles` in the firm), `decided_at`, `decision_note`, and the decided value. |
| `document` (`signedDocuments`) | Documents of this case whose ids are the refs (UUIDs only), each with its original file name and a 300-second signed URL. |

## Not here

- No per-transaction exclusion or edit (D-10, deferred). Staff correct a figure with Edit and a note.
- No storage keys, unsigned URLs or account numbers ever leave this module; only signed URLs and `••mask` labels.

## Tests

- `evidence.test.ts` (unit, see `evidence.test.md`).
- `app/worker/test/financials-evidence.test.ts` (live, see its doc).
