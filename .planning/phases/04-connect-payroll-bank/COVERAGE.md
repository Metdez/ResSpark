# Phase 4 — API Coverage Decision Matrix

> Produced by gsd-planner because the PLAN bodies integrate two product APIs for the first time: Plaid (Hosted Link, Transactions, Statements, Items, webhook verification, Sandbox) and Truv (orders, Bridge, income reports, documents, webhooks). Default is `INTEGRATE`; every `OPT-OUT` carries a one-line reason. Scope: every Plaid and Truv capability named in the research, plus the platform surfaces this phase adds (Cloudflare Queues/Cron, Supabase Storage from the Worker, Web Crypto). Capability cells are prefixed with their vendor and product group.

| capability | decision | reason |
|------------|----------|--------|
| Plaid Link: `POST /link/token/create` with `hosted_link` + statements window | INTEGRATE | Plan 04 `plaid/link.ts` (D-08, BANK-01); fresh token per tap; `days_requested: 365`, `required_if_supported_products: ['statements']` |
| Plaid Link: `POST /link/token/get` → `item_add_results[]` | INTEGRATE | Plan 04 missed-webhook recovery inside the 6 h window (WEBH-02) |
| Plaid Link: `hosted_link.delivery_method` (Plaid-sent SMS/email) | OPT-OUT | beta, per-link fee, Sandbox sends nothing; we deliver our own link (SUMMARY conflict 4, D-08) |
| Plaid Link: embedded Link (`react-plaid-link`, link-initialize.js) | OPT-OUT | Hosted Link in the same tab avoids OAuth re-init and webview failures (PITFALLS C5); `cdn.plaid.com` stays in CSP only as future-proofing (D-16) |
| Plaid Link: `enable_multi_item_link` | OPT-OUT | not set; if a session still returns several public tokens they become sibling connections (D-09) |
| Plaid Link: update mode (`access_token` on token create) | OPT-OUT | `ITEM_LOGIN_REQUIRED` surfaces as `Client must reconnect`; a new tap creates a new Item; Phase 8 may add update mode |
| Plaid Link: Data Transparency Messaging customization | OPT-OUT | configured by the operator in the Plaid Dashboard (Plan 02 `user_setup`); our consent screen is the primary evidence (D-12) |
| Plaid Items: `POST /item/public_token/exchange` | INTEGRATE | Plan 04 `completeSession` → AES-GCM vault (BANK-02) |
| Plaid Items: `POST /item/remove` | INTEGRATE | Plan 04 `remove-items.ts`, dispatched daily by the Plan 02 cron (BANK-06, D-13) |
| Plaid Items: `/item/get`, webhook update, access-token invalidate | OPT-OUT | webhook URL fixed at token creation; no token rotation flow in v1 |
| Plaid Items: `ITEM/ERROR` and `PENDING_DISCONNECT` webhooks | INTEGRATE | Plan 04 `bank-reconcile.ts` → `error` status / warning event (PITFALLS M4) |
| Plaid Items: `NEW_ACCOUNTS_AVAILABLE`, `LOGIN_REPAIRED`, other ITEM webhooks | OPT-OUT | stored idempotently by the generic route and ignored by the consumer; no v1 flow depends on them |
| Plaid Transactions: `POST /transactions/sync` cursor loop | INTEGRATE | Plan 04 `plaid/transactions.ts` (BANK-02); `count: 500`, mutation restart, `transactions_update_status` |
| Plaid Transactions: `SYNC_UPDATES_AVAILABLE` webhook | INTEGRATE | Plan 04 incremental re-sync hint (D-09) |
| Plaid Transactions: `/get`, `/refresh`, `/recurring/get`, legacy webhooks | OPT-OUT | sync is the documented path; legacy codes are stored and ignored |
| Plaid Transactions: enrichment beyond category primary/detailed | OPT-OUT | only `primary`/`detailed` stored as text for the staff table; no categorized-expense product (PITFALLS C7, M7) |
| Plaid Statements: `POST /statements/list` | INTEGRATE | Plan 04 `plaid/statements.ts` → month cells (BANK-03) |
| Plaid Statements: `POST /statements/download` (`Plaid-Content-Hash`) | INTEGRATE | Plan 04 → Storage + `documents` rows (BANK-02) |
| Plaid Statements: `POST /statements/refresh` + `STATEMENTS_REFRESH_COMPLETE` | INTEGRATE | once per connection: zero-statement accounts → one refresh → `not_supported` on a still-empty list (D-10) |
| Plaid Statements: non-depository accounts | OPT-OUT | not offered by Plaid; `PRODUCTS_NOT_SUPPORTED` → `not_supported` cells + manual upload (PITFALLS C6) |
| Plaid products: auth, identity, income, assets, investments, liabilities | OPT-OUT | compliance framing is Transactions + Statements only; income/employment comes from Truv (PROJECT, PITFALLS C7) |
| Plaid products: transfer, signal, identity verification, beacon, credit | OPT-OUT | consumer-report/credit products need an annual contract Andrew declined; no money movement in ResSpark (PITFALLS C7) |
| Plaid products: `balance` (`/accounts/balance/get`), `/accounts/get` | OPT-OUT | account metadata arrives inside sync and statements list; balances are not 433-A documents in v1 |
| Plaid webhooks: `/webhook_verification_key/get` + ES256 `Plaid-Verification` JWT | INTEGRATE | Plan 01 `webhooks/plaid.ts` — `iat` ≤ 5 min, `request_body_sha256` on raw bytes (WEBH-01, D-02) |
| Plaid Sandbox: Hosted Link with `user_good`/`pass_good` (real SESSION_FINISHED) | INTEGRATE | Plan 07 rehearsal runbook; the only path that exercises Plaid's real signature (RESEARCH Pitfall 2) |
| Plaid Sandbox: `POST /sandbox/public_token/create` | OPT-OUT | fixtures + live-DB tests cover sync/statements without minting Sandbox Items; optional manual tool |
| Plaid Sandbox: `POST /sandbox/item/fire_webhook` | OPT-OUT | signed fixtures cover `SYNC_UPDATES_AVAILABLE`/`ERROR`/`PENDING_DISCONNECT`; Dashboard sandbox tools can fire them during rehearsal |
| Plaid Sandbox: `/sandbox/item/reset_login`, verification status, transfer sims | OPT-OUT | not needed for the demo path |
| Truv orders: `POST /v1/orders/` (income; notifications suppressed) | INTEGRATE | Plan 03 `truv/orders.ts` `createOrder` (D-05, PAY-01); `template_id` only when `TRUV_TEMPLATE_ID` is set |
| Truv orders: `GET /v1/orders/{id}/` | INTEGRATE | Plan 01 reconcile read; Plan 03 order reuse (`bridge_token`) and expiry (`is_expired`) (WEBH-02, PAY-04) |
| Truv orders: `POST /v1/orders/{id}/employers/` | OPT-OUT | the client adds employers inside the open order via Bridge; a staff "add employer" action is Phase 8 |
| Truv orders: `PATCH`/`DELETE`, `/cancel/`, `/refresh/` | OPT-OUT | no staff order management in v1; expiry is handled by creating a new order |
| Truv orders: `share_url` (Truv-hosted landing page) | OPT-OUT | embedding keeps the client in the step list (D-05) |
| Truv orders: `employers[]` pre-population | OPT-OUT | an open order with no pre-populated employers lets the client add several (`multiple.employments`) |
| Truv Bridge: `cdn.truv.com/bridge.js` `TruvBridge.init({ isOrder: true })` | INTEGRATE | Plan 05 `use-truv-bridge.ts` + `payroll-step.tsx`; `COMPLETED` (source `order`) and `onClose` trigger reconcile (D-05) |
| Truv Bridge: `POST /v1/bridge-tokens/` (standalone token) | OPT-OUT | orders return their own `bridge_token`; standalone tokens are the non-order flow |
| Truv Bridge: `onSuccess` as a completion signal | OPT-OUT | only `onEvent('COMPLETED', _, 'order')` + webhooks count (D-05) |
| Truv reports: `GET /v1/links/{link_id}/income/report/` | INTEGRATE | Plan 03 `truv/reports.ts` → pay stubs, W-2s, `pdf_report` into Storage + `documents` (D-06, PAY-02) |
| Truv reports: `GET /v1/links/{link_id}/documents/` (PAYSTUB, W2, F1099) | INTEGRATE | Plan 03 — in-widget uploaded documents attributed to the employer (PAY-02/PAY-03) |
| Truv reports: `GET /v1/links/{link_id}/employment/report/` | OPT-OUT | the income report already carries `employments[]`; a second report adds cost (PITFALLS M5) |
| Truv reports: `statements-created`/`employment-created` webhooks | OPT-OUT | order/task status drives the fetch; per-entity events are stored and ignored |
| Truv reports: data refresh `/links/{id}/refresh/`, tasks API | OPT-OUT | one-time pull per completed employer; task detail beyond `task-status-updated` is not needed |
| Truv products: direct deposit switch, PLL, insurance, tax, scoring, assets | OPT-OUT | income only — Plaid covers bank data; cost control and compliance framing (D-05, PITFALLS M5) |
| Truv webhooks: `X-WEBHOOK-SIGN` `v1=` HMAC-SHA256 on the raw body | INTEGRATE | Plan 01 `webhooks/truv.ts` with the Access Secret as key (WEBH-01, D-02) |
| Truv webhooks: `order-status-updated`, `task-status-updated` | INTEGRATE | Plan 01 consumer keyed by `webhook_id`; unmatched `link_id` → reconcile all non-terminal payroll connections |
| Truv webhooks: `link-connected`, `link-disconnected`, other event types | OPT-OUT | not subscribed (Plan 02 `user_setup`); if delivered they are stored and ignored |
| Truv webhooks: `GET /v1/webhooks/`, `PATCH /v1/webhooks/{id}/` | OPT-OUT | documented in Plan 07 `truv-webhook-endpoint.md`; cron reconcile is the backstop; automated health check is Phase 8 |
| Cloudflare Queues: send/sendBatch, ack/retry, `max_retries: 5`, DLQ consumer | INTEGRATE | Plans 01–02 (WEBH-01, D-03) |
| Cloudflare Cron: `*/15 * * * *` and `0 3 * * *` + `scheduled()` | INTEGRATE | Plan 02 (WEBH-02, D-04, D-13) |
| Web Crypto: AES-GCM vault, HMAC-SHA256 + `timingSafeEqual`, SHA-256 | INTEGRATE | Plans 01, 03, 04 |
| Cloudflare secrets: `wrangler secret put` over stdin, `secrets.required` | INTEGRATE | Plan 02 `secrets:provider` (D-15) |
| Cloudflare KV / Durable Objects for the Plaid key cache | OPT-OUT | module-level `Map` keyed by `kid` is enough; a cold isolate refetches one key |
| Supabase Storage: `upload(path, bytes, { upsert: false })` into `case-documents` | INTEGRATE | Plan 03 `storeProviderFile` (payroll files; Plan 04 statements) |
| Supabase Storage: `createSignedUrl` for staff preview | INTEGRATE | Phase 3 route reused; Plan 06 links through it |
| Supabase Postgres: `connection_set_status`, `connection_record_event`, 7 tables | INTEGRATE | Plan 01 migration `0005_connections.sql` (D-14) |
| Supabase Realtime for connection status | OPT-OUT | polling (5 s admin / 3–5 s client) per SUMMARY conflict 6 |
| Teller: any endpoint, mTLS binding | OPT-OUT | Phase 8; only `PROVIDER_CAPABILITIES.teller` and the `BankProvider` interface exist now (D-11, BANK-04) |
