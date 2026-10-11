# `app/worker/src/extract/accounts.ts`

Port of `_health`, `_retirement`, `_life` and `_investment` in `src/document_parse.py`. Each reads `Label:` / value pairs; a missing required label is `Missing <first label>`.

| Export | Labels read | Result |
|--------|-------------|--------|
| `health(texts)` | `Monthly Premium` or `Premium` | `_kind: 'health'`, `actual_health_insurance_premiums` |
| `retirement(texts)` | `Market Value` or `Account Value`; optional `Loan Balance` | `_kind: 'retirement'`, `retirement_accounts_market_value`, and `retirement_accounts_loan_balance` only when the statement shows a loan |
| `life(texts)` | `Cash Value`; optional `Policy Loan` or `Loan Balance` | `_kind: 'life'`, `life_insurance_cash_value`, and `life_insurance_loan_balance` only when a loan line is present |
| `investment(texts)` | `Net Value` or `Account Value` | `_kind: 'investment'`, `investment_accounts_net` |
