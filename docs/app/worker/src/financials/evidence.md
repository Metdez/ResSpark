# `app/worker/src/financials/evidence.ts`

The evidence behind one 433-A figure (D-09, D-10, FORM-03). `GET /api/admin/cases/:id/financials/:column/evidence` (see `routes/admin-financials.md`) calls `buildEvidence`, and the staff SPA shows the result in the right-side evidence Sheet. Every read is scoped by firm and case. Amounts come from SQL (`financial_bank_monthly`) or from the stored proposal; this module never recomputes a figure.

## Types

| Type | Meaning |
|------|---------|
| `BankTxn` | One transaction row: id, date, name, merchant, amount (positive; inflows are sign-flipped like the SQL aggregate) and the account label `{name} ••{mask}`. |
| `CrossCheck` | `{ label, monthly }` or `null`. |
| `EvidenceView` | One variant per `kind`. `bank`: window, months with exact subtotals and their transactions, the average (the proposal value), `truncated`, `cross_check`. `none`: the line has no proposal yet. |
| `EvidenceProposal` | The proposal columns this module reads (`SELECT`). |

## Parts

| Part | What it does |
|------|--------------|
| `MAX_TRANSACTIONS` | 500. At most 500 transactions are listed; `truncated` says more exist (T-07-44). The subtotals still include every transaction because they come from SQL. |
| `evidenceKind(p)` | Pure dispatch: `plaid` opens `bank`; anything else opens `none`. |
| `windowMonths(start, end)` | Pure: `YYYY-MM-01` for every calendar month the window touches, oldest first (capped at 24). A month with no rows still appears with a `0` subtotal, so staff see what the average divides by. |
| `pickProposal` | With a proposal id: that row only when it belongs to the firm, case and column (any status); otherwise `undefined`. Without one: the confirming proposal (`accepted` or `edited`, newest `decided_at`), else the newest `proposed` row, else `null`. |
| `buildEvidence(env, { firmId, caseId, column, proposalId })` | Reads the case with `firm_id` (T-07-43); a missing or foreign case is `null`, and so is a proposal id that is not this case's and column's. No proposal gives `{ kind: 'none', column, label }`. Otherwise it dispatches by `evidenceKind`. The label is `labelFor(column)` from `lines.ts`. |
| `bankScope` | The case's bank connections, with the same filter as `financial_bank_monthly` (firm, case, `kind = 'bank'`, not `removed`). Transactions are only ever read through these ids. |
| `monthlyRows` | Calls `financial_bank_monthly(firm, case, window)`. |
| `bankEvidence` | For a Plaid income or expense proposal: the per-month subtotal is the sum of the SQL rows for this column with treatment `income` or `expense` (cents, divided by 100 once). The categories mapped to the column come from `plaid_category_map` rows (data, never literals in code). Transactions are read per treatment: non-pending, in the window, in those categories, with the same sign rule as the SQL (`income` needs `amount < 0` and is shown as `-amount`; `expense` needs `amount > 0`). Each query is ordered by date (newest first) and limited to 501, so the merge knows when more than 500 exist. Account labels come from `bank_accounts` (`name ••mask`); the account number never leaves the database. `average` is the proposal's `proposed_value`. |

## Not here

- No per-transaction exclusion or edit (D-10, deferred). Staff correct a figure with Edit and a note.
- No storage keys or unsigned URLs ever leave this module.

## Tests

- `app/worker/test/financials-evidence.test.ts` (live, see its doc).
