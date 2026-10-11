# `app/worker/src/integrations/bank/plaid/accounts.test.ts`

Unit tests for `getAccountBalances`. Plaid is stubbed with `stubVendorFetch`, and no network or database is used.

| Test | What it proves |
|------|----------------|
| posts the access token and maps balances | The request body is exactly `{ access_token }`. With `fixtures/plaid/accounts_get.json`, the depository checking account maps to `current 1250.75`, `available 1100.5`, and an ISO `as_of` (the call time, since Plaid gave `null`). The credit card keeps `available: null` and Plaid's `last_updated_datetime`. |
| a 429 is a transient ProviderError | `RATE_LIMIT_EXCEEDED` with status 429 becomes `ProviderError { transient: true }`, so the queue retries. |
| a malformed body is a permanent bad_response | `accounts` that is not an array fails the guard and gives `bad_response`, not transient. |
