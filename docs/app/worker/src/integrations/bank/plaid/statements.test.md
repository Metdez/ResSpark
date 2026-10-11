# app/worker/src/integrations/bank/plaid/statements.test.ts

Unit tests for `plaid/statements.ts` with Plaid stubbed.

| Test | Proves |
|------|--------|
| lists accounts | The list response maps to normalized accounts with `{ id, year, month }` statements. |
| `PRODUCTS_NOT_SUPPORTED` | `{ supported: false, ready: true, accounts: [] }`. |
| `PRODUCT_NOT_READY` | `{ supported: true, ready: false, accounts: [] }`. |
| refresh first | `requestRefresh` posts `/statements/refresh` (access token, start and end dates) before `/statements/list`. |
| download | Bytes are returned as sent; `sha256` is the `Plaid-Content-Hash` header, `null` when absent. |
