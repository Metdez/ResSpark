# app/worker/src/integrations/bank/plaid/client.ts

The Plaid HTTP client. Plain `fetch`, no `plaid` npm package.

| Part | What it does |
|------|--------------|
| `PLAID_HOSTS` | `sandbox` and `production` base URLs. |
| `PERMANENT_ITEM_ERRORS` | Item error codes that need the client to reconnect (`ITEM_LOGIN_REQUIRED`, `INVALID_ACCESS_TOKEN`, `ITEM_NOT_FOUND`, `USER_PERMISSION_REVOKED`, `USER_ACCOUNT_REVOKED`). The bank reconcile stops on these instead of retrying (Plan 04-04 Task 2). |
| `TRANSIENT_CODES` | Plaid error codes that are retried even on a non-5xx status: `RATE_LIMIT_EXCEEDED`, `INTERNAL_SERVER_ERROR`. |
| `hostOf(env)` | Host by `env.PLAID_ENV`; an unknown or missing value means sandbox. |
| `plaidRaw(env, path, body)` | POSTs JSON with `PLAID-CLIENT-ID` / `PLAID-SECRET` headers and returns the raw `Response` (used for binary `/statements/download`). Missing keys throw `ProviderError('plaid', null, 'provider_not_configured', false)`. A network failure is `ProviderError(..., 'network', true)`. A non-2xx is `ProviderError('plaid', status, error_code ?? 'http_<status>', transient)` where transient means 429, 5xx, or a code in `TRANSIENT_CODES`. |
| `plaidFetch(env, path, body, guard?)` | `plaidRaw` plus JSON parse. A body that is not JSON or fails `guard` is `ProviderError(..., 'bad_response', false)`. |

Bodies and headers are never logged: they carry access tokens and client financial data.
