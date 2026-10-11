# app/worker/src/integrations/bank/plaid/link.ts

Plaid Hosted Link: creating a session and completing it (D-08, D-09, BANK-01, BANK-02).

| Part | What it does |
|------|--------------|
| `statementsWindow(now)` | `{ start_date: now - 180 days, end_date: now }` as `YYYY-MM-DD` (UTC). The 6-month statement window. |
| `LinkTokenParams` | `requestId`, `firmName`, `webhookUrl`, `returnUrl`, `statementsStart`, `statementsEnd`. |
| `linkTokenBody(p)` | The pure `/link/token/create` body, tested on its own. `products: ['transactions']` only; statements are `required_if_supported_products` so a bank without statements can still link (SUMMARY conflict 5); `transactions.days_requested: 365` so history is not the 90-day default (PITFALLS C6); `hosted_link` with `completion_redirect_uri` (the return URL with the nonce), `url_lifetime_seconds: 1800`, `is_mobile_app: false`; `user.client_user_id` is the request id; `webhook` is our Plaid webhook URL. No other Plaid product is requested (compliance: no auth, identity, income, assets, or credit products). |
| `createLinkSession` | POSTs `/link/token/create` and returns `{ linkRef: link_token, url: hosted_link_url, expiresAt: expiration }`. A response without `hosted_link_url` is `ProviderError('plaid', 200, 'no_hosted_link_url', false)`. |
| `completeSession({ linkRef, publicTokens })` | Public tokens come from the `SESSION_FINISHED` webhook when present. Otherwise (missed webhook) it calls `/link/token/get` and takes every `public_token` in `link_sessions[].results.item_add_results[]`, with `institution.name`. Each token is exchanged at `/item/public_token/exchange` for `{ accessToken, externalId: item_id, institutionName }`. |

The webhook path has no institution name (the webhook does not carry one), so `institutionName` is `null` there.
