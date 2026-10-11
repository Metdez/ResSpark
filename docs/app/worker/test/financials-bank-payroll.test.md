# `app/worker/test/financials-bank-payroll.test.ts`

The live suite for the payroll (`truv`) and bank (`plaid`) proposers (FORM-03, FORM-07). It runs against the live Supabase project under the test firm `00000000-0000-0000-0000-00000000000e`:

`pnpm -C app run test:live:file worker/test/financials-bank-payroll.test.ts`

Without `SUPABASE_URL` and `SUPABASE_SECRET_KEY` the suite is skipped, and the reason is printed to stderr. No vendor is called: payroll data comes from the fixture report, and bank data is seeded as rows.

## Setup

| Part | What it does |
|------|--------------|
| `vi.mock('../src/middleware/staff-auth')` | A fixed admin staff member of the test firm, so `GET /api/admin/cases/:id/financials` can be called through `app.request`. |
| `env` | Only the Supabase URL and key, with `LOGICS_MODE: 'fake'`. The cases have no Logics id, so the `logics` source is skipped. |
| `NOW` | `2026-10-11T12:00:00Z`. With the default 3-month setting, the window is 2026-07-01 to 2026-09-30. |
| `seed()` | A fresh case (`seedFinancialCase`) with one request holding a payroll and a bank connect item. |
| `insertConnection(fx, kind, data, status)` | Inserts a `truv` payroll or `plaid` bank connection row directly, `done` by default. |
| `open`, `valueOf`, `line` | Reads the open proposals of one source, finds one column, and finds one line in the GET view. |
| `afterAll` | Deletes the connections of every seeded request (which cascades accounts and transactions), then calls each fixture's `cleanup()`. Cases are never deleted. |

## Cases

1. **Truv tracer:** a `done` payroll connection whose `data` is `fixtures/truv/income_report_proposals.json`. `runFinancialsPropose` inserts six `truv` proposals: wages, taxes, health, life, court-ordered and `is_wage_earner`. Wages are 9341.67 with a `pay_stub` ref for the 2026-09-18 Acme stub. GET financials shows `gross_wages_taxpayer` as `proposed` with source `truv` and the window `2026-07-01` to `2026-09-30`. A rerun keeps all six and inserts nothing.
2. **Plaid:** a `done` bank connection with `transactions_update_status: HISTORICAL_UPDATE_COMPLETE`, one depository account `Checking ••0000` with `balance_current` 2500, and seeded transactions. The categories are test data. There are rent of 1500, a car payment of 400 and dividends of -30 (an inflow) in each of Jul, Aug and Sep 2026, a 5000 account transfer, a pending 777 rent row, and a 999 rent row in June 2026 (outside the window, but it makes the earliest date precede the window start). The `bank` source inserts exactly four proposals: housing 1500 (`sum_outflows_3mo_div_3`), vehicle loan 400, dividends 30 (`sum_inflows_3mo_div_3`), and cash 2500 (`sum_depository_balance_current`, ref to the account). The transfer and the pending row propose nothing. When the connection status is set back to `INITIAL_UPDATE_COMPLETE`, the next run reports `bank: 'skipped'` and the four rows stay.
