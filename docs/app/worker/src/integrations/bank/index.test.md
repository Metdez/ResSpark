# app/worker/src/integrations/bank/index.test.ts

Unit tests for the bank provider selector.

| Test | Proves |
|------|--------|
| Plaid by `BANK_PROVIDER` | Returns `plaidProvider` with `PROVIDER_CAPABILITIES.plaid`. |
| `unknown_provider` | `teller` (explicit id) and an unknown `BANK_PROVIDER` throw. |
| `plaidConfigured` | False when either `PLAID_CLIENT_ID` or `PLAID_SECRET` is empty. |
