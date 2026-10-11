# `app/worker/src/financials/propose/bank.test.ts`

Unit tests for the `plaid` proposer, plus the category guard. No database is used.

## Mock

`../../db/client` is replaced with a chainable fake. Each awaited query resolves to the next queued result, in this order: the connections, then the earliest transaction for each connection, then the accounts. `rpc` is a `vi.fn` that answers `financial_bank_monthly`. `ready(accounts)` queues one complete connection whose earliest transaction is 2026-03-02, followed by the accounts. `monthRow(...)` builds one SQL row.

## proposeBank cases

| Test | Expectation |
|------|-------------|
| averages mapped columns | The RPC is called with the firm, case and window. 3 months × 150000 cents of `actual_housing_utilities` gives 1500, method `sum_outflows_3mo_div_3`, reliability B, the window dates, and refs for all three accounts. 9000 cents of `interest_dividends_royalties` income gives 30, `sum_inflows_3mo_div_3`. An `informational` wage row and a zero-transaction column propose nothing. |
| cash | The checking balance (number 1250.75) plus the savings balance (string `'500.10'`) gives 1750.85, method `sum_depository_balance_current`, reliability A, no window. The credit account is left out. |
| no cash | A depository account with a `null` balance means no cash proposal. |
| 6-month window | The same 3-month total gives 750 with `sum_outflows_6mo_div_6`. |
| history not complete | A second connection at `INITIAL_UPDATE_COMPLETE` gives `null`, and the RPC is never called. |
| mapped status | `historical` is accepted. |
| late history | An earliest transaction after the window start gives `null`. |
| no connection | `{ source: 'plaid', proposals: [] }`. |

## Category guard (T-07-33)

Every non-test `.ts` file under `app/worker/src/financials/`, read recursively, is checked for these tokens: the PFC prefixes `INCOME_`, `TRANSFER_`, `LOAN_`, `RENT_AND_UTILITIES`, `FOOD_AND_DRINK`, `GENERAL_SERVICES`, `TRANSPORTATION_` and `GOVERNMENT_AND`, and the Truv categories `socialsec`, `garnishment` and `medicare`. The test fails and names the file if any of them appears. A first test proves the walk actually reaches `bank.ts` and `payroll.ts`.
