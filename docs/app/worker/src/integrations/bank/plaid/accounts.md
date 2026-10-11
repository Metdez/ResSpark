# `app/worker/src/integrations/bank/plaid/accounts.ts`

Plaid `/accounts/get`: current account balances for one Item (D-09 as corrected by 07-RESEARCH). Cash on hand (`cash_and_bank_balances`) comes from these balances. It is never computed by summing transactions.

| Part | What it does |
|------|--------------|
| `NormBalance` | Re-exported from `../provider`, where the provider-neutral shape is defined: `{ external_account_id, current, available, as_of }`. |
| `AccountsGet` | The part of the Plaid response that is read: `accounts[].account_id` and `accounts[].balances.{ current, available, last_updated_datetime }`. |
| `isAccountsGet(v)` | Response guard: `accounts` is an array and every item has a string `account_id`. A failed guard makes `plaidFetch` throw a permanent `ProviderError('bad_response')`. |
| `num(v)` | A finite number, or `null`. A missing balance stays `null` and is never turned into 0. |
| `getAccountBalances(env, accessToken)` | POSTs `/accounts/get` with `{ access_token }` through `plaidFetch`. Errors follow `client.ts`: a network failure, a 429, a 5xx, or `RATE_LIMIT_EXCEEDED`/`INTERNAL_SERVER_ERROR` is a transient `ProviderError`, and any other non-2xx is permanent with Plaid's `error_code`. Each account becomes a `NormBalance`. `as_of` is Plaid's `last_updated_datetime`, which Plaid usually leaves `null` for depository accounts. In that case the call time is used. |

Nothing from the response is logged. Bank-reconcile calls this once per reconcile (see `jobs/bank-reconcile.md`). Plaid documents `/accounts/get` as cached data at no extra charge, unlike `/accounts/balance/get` (07-RESEARCH Assumption A4). That was not verified against a billing statement in this environment, because there are no Plaid keys.
