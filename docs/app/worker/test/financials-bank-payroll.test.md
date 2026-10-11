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
