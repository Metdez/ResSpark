# `app/worker/test/financials-evidence.test.ts`

Live test of `GET /api/admin/cases/:id/financials/:column/evidence` (D-10, FORM-03) against the Supabase project. Run with `pnpm -C app run test:live:file worker/test/financials-evidence.test.ts`. Without `SUPABASE_URL` and `SUPABASE_SECRET_KEY` the suite is skipped with a note on stderr.

| Part | What it does |
|------|--------------|
| `staffAuth` mock | Every request is an admin of the test firm `00000000-0000-0000-0000-00000000000e`. |
| `get(caseId, column, query?)` | Calls the route through `app.request`. |
| `seedBank()` | A fresh case with a bank item, a `done` Plaid connection with complete history, one `Checking ••0000` depository account (balance 2500, as-of time) and the Plan 07 transactions: rent 1500 and car 400 in Jul, Aug and Sep 2026, dividends of -30 (money in) each month, a 5000 transfer, a pending 777 rent and a June rent. It runs `runFinancialsPropose` at 2026-10-11 and expects four Plaid proposals. |
| Cleanup | Deletes each fixture's connections (bank accounts and transactions cascade) and calls the fixture's `cleanup()`. Cases are never deleted. |

## Cases

- **Bank:** housing returns `kind 'bank'`, the window Jul 1 to Sep 30 (3 months), three months each with subtotal 1500 and one rent transaction on `Checking ••0000`, average 1500, not truncated, no cross-check. No pending, transfer or June amount appears, and neither does the external account id or any storage key. Dividends read as positive 30 per month.
- **Scoping and input:** a proposal id opens that proposal (car, 400); the same id on another column is 404; an unknown column is 400; a non-UUID `proposal_id` is 400; a line without proposals returns `kind 'none'`; a case of another firm (read-only lookup; nothing is written outside the test firm) or a random id is 404.
