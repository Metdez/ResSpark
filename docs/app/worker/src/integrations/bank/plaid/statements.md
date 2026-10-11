# app/worker/src/integrations/bank/plaid/statements.ts

Plaid Statements: list, download and refresh (D-10, BANK-02, BANK-03).

| Part | What it does |
|------|--------------|
| `ListResponse` | The `/statements/list` fields read: per account `account_id`, `account_mask`, `account_name`, `account_official_name`, `account_type`, `account_subtype`, and `statements[]` with `statement_id`, `year`, `month`. |
| `refreshStatements(env, accessToken, { start, end })` | POSTs `/statements/refresh` with `start_date` and `end_date`. Plaid answers later with a `STATEMENTS_REFRESH_COMPLETE` webhook. |
| `listStatements(env, accessToken, opts?)` | With `opts.requestRefresh`, refreshes first, then POSTs `/statements/list`. Returns `{ supported: true, ready: true, accounts }` with each account normalized and its statements as `{ id, year, month }`. `PRODUCTS_NOT_SUPPORTED` returns `{ supported: false, ready: true, accounts: [] }` (the bank has no statements). `PRODUCT_NOT_READY` returns `{ supported: true, ready: false, accounts: [] }` (try again later). Other errors propagate. |
| `downloadStatement(env, accessToken, statementId)` | POSTs `/statements/download` through `plaidRaw` and returns `{ bytes, sha256 }`, where `sha256` is the `Plaid-Content-Hash` header or `null`. The caller verifies the hash. |
