# `app/worker/test/financials-evidence.test.ts`

Live test of `GET /api/admin/cases/:id/financials/:column/evidence` (D-10, FORM-03) against the Supabase project. Run with `pnpm -C app run test:live:file worker/test/financials-evidence.test.ts`. Without `SUPABASE_URL` and `SUPABASE_SECRET_KEY` the suite is skipped with a note on stderr.

| Part | What it does |
|------|--------------|
| `staffAuth` mock | Every request is an admin of the test firm `00000000-0000-0000-0000-00000000000e`, named `Test agent`. |
| `get(caseId, column, query?)` | Calls the route through `app.request`. |
| `seedBank()` | A fresh case with a bank item, a `done` Plaid connection with complete history, one `Checking ••0000` depository account (subtype checking, balance 2500, as-of 2026-10-10 12:00 UTC) and the Plan 07 transactions: rent 1500 and car 400 in Jul, Aug and Sep 2026, dividends of -30 (money in) each month, a 5000 transfer, a pending 777 rent and a June rent. It runs `runFinancialsPropose` at 2026-10-11 and expects four Plaid proposals. |
| Cleanup | Removes the uploaded storage objects, deletes each fixture's connections (bank accounts and transactions cascade) and calls the fixture's `cleanup()` (which also deletes the case's documents). Cases are never deleted. |

## Cases

- **Bank:** housing returns `kind 'bank'`, the window Jul 1 to Sep 30 (3 months), three months each with subtotal 1500 and one rent transaction on `Checking ••0000`, average 1500, not truncated, no cross-check. No pending, transfer or June amount appears, and neither does the external account id or any storage key. Dividends read as positive 30 per month.
- **Cash:** `kind 'balances'`, total 2500, one account with its `••0000` label, type, subtype, balance and as-of time; the external account id never appears.
- **Payroll:** a `done` Truv connection with the Plan 07 income report, proposed at 2026-10-11, and one stub PDF uploaded to the bucket at the Phase 4 path `.../payroll/acme-inc-emp_1/paystub-2026-09-18-3003.pdf` with its `pay_stub` document row. Wages return `kind 'payroll'` with value 9341.67, the wage method and window; five stubs; the Acme 2026-09-18 stub reads 2650, `biweekly`, and a `document_url` that starts with the Supabase URL and carries `token=`; the Beta stub (no stored PDF) reads 1800, `semimonthly`, `document_url: null`. The formula lists Acme (7950 over 3 stubs × 26 = 5741.67) and Beta (3600 over 2 stubs × 24 = 3600). The bare storage key is not a field.
- **Intake, Logics, address, staff:** an intake proposal for `household_size` returns its question prompt and answer 3; a Logics proposal returns field `TaxLiability` and 12345.67; a confirmed USPS address (FIPS 06037) run through the proposer returns `kind 'address'` with FIPS `06037`, a Los Angeles county and the street, city, state and ZIP; a `known_zero` decision on `net_rental_income` returns `kind 'staff'` by `Test agent` with value 0.
- **Scoping and input:** a proposal id opens that proposal (car, 400); the same id on another column is 404; an unknown column is 400; a non-UUID `proposal_id` is 400; a line without proposals returns `kind 'none'`; a case of another firm (read-only lookup; nothing is written outside the test firm) or a random id is 404.
