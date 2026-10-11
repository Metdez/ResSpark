# app/worker/src/integrations/bank/plaid/link.test.ts

Unit tests for `plaid/link.ts`. Plaid is stubbed with `stubVendorFetch` on `sandbox.plaid.com`.

| Test | Proves |
|------|--------|
| `linkTokenBody` D-08 fields | The whole body deep-equals the D-08 shape: transactions only, statements required-if-supported, 365 days, hosted link 1800 s, not a mobile app. |
| `statementsWindow` | 2026-10-11 gives 2026-04-14 to 2026-10-11 (180 days). |
| `createLinkSession` | Returns link token, URL and expiry; sends `PLAID-CLIENT-ID`; a missing `hosted_link_url` is `no_hosted_link_url`. |
| webhook tokens | Public tokens from the webhook are exchanged directly; `/link/token/get` is not called. |
| `/link/token/get` recovery | Without tokens, the session results supply the public token and institution name. |
| error mapping | 429 `RATE_LIMIT_EXCEEDED` is a transient `ProviderError`; 400 `ITEM_LOGIN_REQUIRED` is permanent. |
