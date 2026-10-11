# Phase 4: Connect Payroll & Bank - Research

**Researched:** 2026-10-10
**Domain:** Truv embedded orders (payroll), Plaid Hosted Link + Transactions + Statements (bank), generic webhook → queue → reconcile framework on Cloudflare Workers, encrypted provider tokens in Supabase Postgres, statement/pay-stub PDFs in Supabase Storage
**Confidence:** MEDIUM-HIGH (vendor facts read from official docs via Context7 and direct fetch today; nothing exercised against live Plaid/Truv because no credentials exist in the repo)

<user_constraints>
## User Constraints

**No `04-CONTEXT.md` exists** (`init.phase-op` reports `has_context: false`). The constraints below are the already-locked decisions this phase inherits. They carry the same authority as CONTEXT.md decisions; the planner MUST honor them.

### Locked Decisions (inherited)
From `.planning/ROADMAP.md` Phase 4 scope notes `[CITED: .planning/ROADMAP.md]`:
- Plaid **Hosted Link opened from our own portal button** (not Plaid-sent SMS/email Link Delivery).
- `transactions.days_requested` of **200 or more** because it cannot change later.
- `statements` in **`required_if_supported_products`**.
- Access tokens **encrypted** at rest.
- **Plain `fetch` provider clients (no `plaid` npm package)**.
- The generic **`/api/webhooks/:provider`** route also takes the DocuSeal verifier in Phase 6.

From `.planning/research/SUMMARY.md` resolved conflicts 4 and 5 `[CITED: .planning/research/SUMMARY.md]`:
- Fresh link token **per tap**, 900-1800 s lifetime, fixed return route with a **single-use nonce**. Success comes **only** from `SESSION_FINISHED` or `/link/token/get`, never from the redirect.
- Each account carries a statement status (available, not supported, uploaded manually). **Manual upload is first-class.**
- Webhooks are **hints**; the consumer re-reads provider state and applies a **monotonic `status_rank`** transition. 5-minute cron, client-triggered reconcile, and staff Refresh heal lost webhooks.

From `.planning/PROJECT.md` `[CITED: .planning/PROJECT.md]`:
- Bank provider behind one `BankProvider` interface, **Plaid first, Teller second**, switch is one config line; resolve the provider **per connection**, not per process.
- Plaid compliance framing: "help people prepare tax returns and tax paperwork"; **Transactions and Statements only** (no credit/consumer-report products). Pay-as-you-go.
- No own SMS provider in v1.
- 6 months of statements and transactions pulled; last 3 months must also be visible.

From Phase 1 `01-CONTEXT.md` (foundation this phase builds on) `[CITED: .planning/phases/01-foundation-staff-sign-in/01-CONTEXT.md]`:
- One Vite project `app/` with `app/worker/` (Hono API, queue consumer, cron) deployed by wrangler as one Worker on **Workers Paid**; queue `resspark-jobs` + DLQ `resspark-jobs-dlq`; cron `*/15 * * * *` (D-06).
- Secrets only via `wrangler secret put`; local `app/.dev.vars`; SPA gets only `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` (D-07). Run wrangler/supabase CLI through `npx -y dotenv-cli --` (D-08).
- Additive SQL migrations in `supabase/migrations/NNNN_<name>.sql` applied by `app/scripts/db-migrate.mjs` via `supabase db query --linked` (D-10). RLS on every table, no `anon`/`authenticated` policies; the Worker is the only data path (D-12).
- `log_event(...)` plpgsql writes `events`; mutations that must be atomic with their event call RPCs (D-11).
- Allowlisted JSON logger; never bodies, headers, tokens (D-20). Vitest 5 projects `web` + `worker` (D-21).

### Claude's Discretion
- Exact table/column names for `connections`, `connection_secrets`, `bank_accounts`, `bank_transactions`, `statements`, `payroll_employments`, `consents`, `webhook_events` beyond the shapes in ARCHITECTURE.md.
- Queue message schema and job names; cron cadence within the 5-15 minute band.
- Hosted Link open strategy on mobile (same tab) and the return-route UX copy.
- Consent screen copy (must follow the "one Use-of-data statement" rule from PITFALLS C7).

### Deferred Ideas (OUT OF SCOPE)
- Teller implementation (Phase 8) — only the capability interface is shaped here.
- Plaid Link Delivery (SMS/email by Plaid), `react-plaid-link` embedded mode.
- Plaid production onboarding, Chase questionnaire, DOB gate (Phase 8).
- Truv `assets` product (Plaid covers bank data; cost control per PITFALLS M5).
- Ongoing bank monitoring, 433-A mapping (Phase 7), DocuSeal (Phase 6).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description (from REQUIREMENTS.md) | Research Support |
|----|-------------|------------------|
| WEBH-01 | Plaid, Truv, DocuSeal webhooks signature-verified on the raw body, stored idempotently by provider and event key, acknowledged within one second, processed by a queue consumer with retries and a DLQ | §Q3 webhook framework: Hono `c.req.text()`, Plaid ES256 JWT + body SHA-256, Truv `v1=` HMAC, `webhook_events(provider,event_key)` unique, `env.JOBS.send`, consumer `ack()/retry()`, `dead_letter_queue` |
| WEBH-02 | Cron reconciler and staff Refresh re-read provider state so a missed webhook never leaves a request stuck | §Q3 reconcile: `/link/token/get` (6 h window), `/transactions/sync` `transactions_update_status`, `/statements/list`, Truv `GET /v1/orders/{id}/`; `scheduled()` handler; Truv endpoint auto-disable makes this mandatory |
| WEBH-03 | Status transitions are monotonic | §Q3 `status_rank` SQL function + `apply_connection_transition` RPC; Truv `event_created_at` sequencing; Plaid `EXITED` vs `SUCCESS` |
| PAY-01 | Client connects payroll via a Truv order opened from the portal step; can add more than one employer in the same order | §Q2 `POST /v1/orders/` (`products: ["income","employment"]`, `external_user_id`), `TruvBridge.init({ isOrder: true })`, open orders allow adding employers, `POST /v1/orders/{id}/employers/`, sandbox `multiple.employments` |
| PAY-02 | Retrieve income/employment report, pay stubs, W-2s attributed to each employer | §Q2 `GET /v1/links/{link_id}/income/report/` (`employments[].statements[].file`, `employments[].w2s[].file`), `/employment/report/`, `/documents/`; one `payroll_employments` row per order employer / link |
| PAY-03 | Client who cannot find employer uploads stubs and W-2s manually in the same step | §Q2 `data_sources: ["payroll","docs"]` on employers (Truv-side docs) and the Phase 3 upload component reused as the ResSpark-side fallback |
| PAY-04 | Truv order status (pending, connected, done, error) reflected in client step and admin status | §Q2 order/employer statuses `pending, sent, completed, error, canceled, expired, no_data, skipped` mapped to ResSpark ranks; `task-status-updated` / `order-status-updated` |
| BANK-01 | Plaid Hosted Link from the portal step; fresh link token per tap, `days_requested >= 200`, Statements where supported | §Q1 `/link/token/create` with `hosted_link`, `url_lifetime_seconds`, `completion_redirect_uri`, `transactions.days_requested`, `required_if_supported_products`, `statements{start_date,end_date}` |
| BANK-02 | Exchange public token, store access token encrypted, sync 6 months transactions, download every available statement PDF | §Q1 `SESSION_FINISHED` → `/item/public_token/exchange` → AES-GCM (§Q4) → `/transactions/sync` loop → `/statements/list` + `/statements/download` → Storage (§Q5) |
| BANK-03 | Per-account statement status by month (available / not supported / uploaded manually) and manual upload fallback | §Q1 `PRODUCTS_NOT_SUPPORTED` on Statements endpoints, `statements[].{month,year}`; `statement_months` table design |
| BANK-04 | `BankProvider` interface with declared capabilities; Plaid first | §Q7 capabilities `{ transactions: true, statementPdfs: boolean }`; Teller has mTLS and no documented statements endpoint |
| BANK-05 | Consent screen before Plaid opens; consent logged | §Q6 Plaid DTM use-case rules; `consents` row written by the `start` RPC before the link token is created |
| BANK-06 | Plaid Items removed after a configurable window (default 30 days) | §Q1 `/item/remove`; cron job selects `connections` past `remove_after`; Transactions is subscription-billed per Item |
</phase_requirements>

## Summary

Phase 4 is three things stacked: (1) a **generic webhook framework** (verify raw body → idempotent insert → enqueue → consumer re-reads provider → monotonic transition; cron + Refresh as the backstop), (2) **Truv embedded orders** for payroll with multi-employer support and a manual-upload path, and (3) **Plaid Hosted Link** for bank data with encrypted access tokens, a `/transactions/sync` cursor loop, statement PDFs into Supabase Storage, per-account statement status, a consent gate, and Item removal. Every vendor fact needed to plan these was read from official docs today and is tagged below; the one systematic gap is that nothing could be exercised live because no Plaid or Truv credentials exist (the user must provision `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, `TRUV_CLIENT_ID`, `TRUV_SECRET`, and a `TOKEN_ENC_KEY_1`; Truv needs no separate webhook secret because the signature key **is** the Access Secret).

Three findings change the plan relative to earlier research: (a) Plaid's `SESSION_FINISHED` has `status` **`SUCCESS` or `EXITED`**, and a second `LINK` webhook, `EVENTS`, arrives for the same session, so the Plaid adapter must accept both and treat only `SUCCESS` with `public_tokens[]` as completion; (b) `/sandbox/item/fire_webhook` cannot fire `SESSION_FINISHED` or `STATEMENTS_REFRESH_COMPLETE`, so those paths are validated by actually completing Hosted Link in Sandbox (`user_good`/`pass_good`) plus recorded-fixture unit tests, while `SYNC_UPDATES_AVAILABLE` can be fired; (c) Truv's webhook endpoint is **disabled after a day without a 2xx plus three more days**, with **no replay** and **no auto re-enable**, which makes the cron reconciler a correctness requirement, not a nicety.

**Primary recommendation:** Build the framework first (route, `webhook_events`, consumer, `status_rank`, cron, Refresh), then Truv (its sandbox is deterministic and needs no OAuth), then Plaid. Keep every provider call in `app/worker/src/providers/{plaid,truv}/` as ~50-line typed `fetch` wrappers, and make the queue consumer the only place that mutates connection state.

## Project Constraints (from CLAUDE.md)

`[VERIFIED: ./CLAUDE.md read this session]`

- TypeScript for all front-end code.
- Every new code file gets a companion Markdown file in `docs/` mirroring the source path; keep in sync.
- No code file over 500 lines; split modularly before crossing the limit.
- Ponytail skill while coding: smallest complete change, no speculative options; `shortcut:` comments on known limits.
- Prefer standard library; avoid adding runtime dependencies unless the task requires one (this phase adds **none**).
- Supabase work uses the Supabase skill: RLS on every exposed table, `app_metadata` not `user_metadata`, no secret key in clients, `security_invoker` views, pin versions.
- Cloudflare: `CLOUDFLARE_API_TOKEN` is in `.env`; use `npx wrangler` or the API; never print the token (Phase 1 D-08: `npx -y dotenv-cli -- npx wrangler …`).
- Keep `case_financial_data` canonical; connected data lands in `data_suggestions`, never written straight into the engine's rows (ARCHITECTURE Anti-Pattern 7). Payroll and bank data in this phase are **documents and normalized rows**, not engine inputs.
- Distinguish `NULL` (unknown) from `0`.
- Do not change IRS thresholds/formulas (not touched here).
- UI references: ERPNext (status badges, tables), DocuSeal (upload/status screens), Bigcapital (money formatting). Copy code only from MIT/Apache sources.
- "Before doing anything, web search for GitHub repos": done — `plaid/pattern` (MIT, transactions sync + webhook patterns), `plaid/tutorial-resources` (webhook tutorial), `truvhq/demo-react-native` (Bridge usage); none are Workers-native, so patterns are copied, not code.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Consent screen + consent logging | Browser (render) | API Worker (RPC writes `consents` + `events`) | Consent must be recorded server-side before any vendor token is minted |
| Link-token / order creation | API Worker | Database (`connections` row first) | Holds `PLAID_SECRET`/`TRUV_SECRET`; the `connections` row must exist before the browser gets a URL so a fast webhook can correlate |
| Opening Plaid Hosted Link / Truv Bridge | Browser | CDN (`cdn.truv.com`, `secure.plaid.com`) | Vendor UI; our SPA only navigates/initializes and never sees tokens |
| Webhook receipt + signature verification | API Worker (`/api/webhooks/:provider`) | — | Raw body + secrets live only in the Worker |
| Idempotency ledger | Database (`webhook_events` unique index) | API Worker | Uniqueness must be enforced where concurrency is serialized |
| Job processing (exchange, sync, downloads) | Queue consumer (same Worker, `queue()` handler) | Database RPCs | Minutes of sequential vendor calls; retries and DLQ are Queue features |
| Reconcile (cron + Refresh) | Cron handler (`scheduled()`) + staff route | Queue consumer (same `reconcileConnection()`) | One code path for hint, cron, and button |
| Access-token encryption | API Worker (Web Crypto AES-GCM) | Database (`connection_secrets.secret_enc bytea`) | Key is a Worker secret; DB never sees plaintext |
| Statement / pay-stub PDF storage | Supabase Storage (private bucket) | API Worker (upload with secret key, signed URL for staff) | Objects are large; Postgres holds metadata only |
| Statement status by month | Database (`statement_months`) | Browser (badge rendering) | Derived from `/statements/list` + manual uploads; must survive reloads |
| Item removal after window | Cron handler | Database (`connections.remove_after`) | Time-based; billing stops only on `/item/remove` |

## Standard Stack

No new runtime packages. Everything below is already in the Phase 1 stack `[CITED: .planning/phases/01-foundation-staff-sign-in/01-RESEARCH.md §Standard Stack]`; versions re-read from the registry today.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `hono` | 4.13.13 `[VERIFIED: npm registry, 2026-10-10]` | `/api/webhooks/:provider`, `/api/c/items/:id/*`, `/api/admin/*` routes; `c.req.text()` raw body | Already the Worker router |
| `jose` | 6.2.12 `[VERIFIED: npm registry]` | `importJWK` + `jwtVerify` for Plaid's ES256 `Plaid-Verification` JWT (`maxTokenAge: '5 min'`) | Plaid's own Node sample uses `jose` `[CITED: plaid.com/docs/api/webhooks/webhook-verification]` |
| `@supabase/supabase-js` | 2.117.3 `[VERIFIED: npm registry]` | Worker data client (secret key); `storage.from().upload()`, `createSignedUrl()`; RPC calls | Already the data path |
| Web Crypto (runtime) | Workers built-in | AES-GCM encrypt/decrypt of access tokens; HMAC-SHA256 for Truv; `crypto.subtle.timingSafeEqual` | Supported algorithms table lists AES-GCM encrypt/decrypt/generateKey/importKey and HMAC sign/verify; `timingSafeEqual` is a documented non-standard extension `[CITED: developers.cloudflare.com/workers/runtime-apis/web-crypto]` |
| Cloudflare Queues + Cron | platform | `resspark-jobs` producer/consumer, `resspark-jobs-dlq`, `scheduled()` | Phase 1 D-06 already provisions them |
| Plain `fetch` | runtime | Plaid (`https://sandbox.plaid.com` / `https://production.plaid.com`) and Truv (`https://prod.truv.com/v1/`) clients | Locked decision; `plaid` npm package is forbidden |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `msw` | 3.0.3 `[VERIFIED: npm registry]` | Mock Plaid/Truv outbound calls in Worker tests | Consumer and reconcile tests |
| `@hono/standard-validator` + `zod` | per Phase 1 | Validate `/api/c/items/:id/start` and admin bodies | Any route with a body |
| Browser `<script src="https://cdn.truv.com/bridge.js">` | CDN | Truv Bridge (no npm package) `[CITED: docs.truv.com/docs/embedded-orders]` | Payroll step; wrap in a typed `useScript` hook |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hosted Link in the same tab | `react-plaid-link` embedded | Embedded needs OAuth re-init and fails in in-app browsers (PITFALLS C5); locked out |
| `jose` for Plaid JWT | Hand-rolled ES256 via Web Crypto | More code, same result; `jose` is already a dependency |
| Plain `fetch` Plaid client | `plaid` npm | Locked decision; the SDK is Node/axios-shaped and heavy for Workers |
| Queue consumer for statement downloads | `ctx.waitUntil` inline | No retries/DLQ; N sequential downloads can exceed the request budget |

**Installation:** none required (`pnpm -C app add` nothing). The planner should still run `wrangler types` after adding the new `secrets.required` names.

## Package Legitimacy Audit

Seam run: `gsd-tools query package-legitimacy check --ecosystem npm jose @supabase/supabase-js hono msw` `[VERIFIED: seam output this session]`.

| Package | Registry | Age / last publish | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `jose` | npm | published 2026-09-05 | 153M/wk | github.com/panva/jose | OK | Approved (already in Phase 1) |
| `@supabase/supabase-js` | npm | published 2026-10-07 | 30.6M/wk | github.com/supabase/supabase-js | SUS (`too-new`: release < 7 days) | Keep — the flag is only recency of the 2.117.3 release; package is official and already adopted in Phase 1. Planner may pin 2.117.3 as already decided; no checkpoint needed beyond Phase 1's |
| `hono` | npm | published 2026-10-04 | 74M/wk | github.com/honojs/hono | SUS (`too-new`) | Keep — same reasoning; pinned 4.13.13 |
| `msw` | npm | published 2026-10-10 | 23M/wk | github.com/mswjs/msw | SUS (`too-new`) | Keep for tests only |

No `postinstall` scripts on `jose`, `@supabase/supabase-js`, `hono` `[VERIFIED: npm view scripts.postinstall → empty]`.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** `@supabase/supabase-js`, `hono`, `msw` — all flagged solely as `too-new` on a fresh patch release of a well-known package; they are Phase 1 dependencies, not new installs. No new `checkpoint:human-verify` is warranted for this phase.

## Q1. Plaid facts (Hosted Link, Transactions, Statements, webhooks, sandbox)

Confidence: **MEDIUM-HIGH** — all read from plaid.com/docs via Context7 (`/llmstxt/plaid_llms_txt`) and direct fetch today; none executed.

### Hosts and auth
- Hosts: `https://sandbox.plaid.com`, `https://production.plaid.com` `[CITED: plaid.com/docs/api/… curl samples]`. Choose by `PLAID_ENV` (`sandbox` | `production`).
- `client_id` and `secret` "may be provided either in the `PLAID-CLIENT-ID` header or as part of a request body" (same for `PLAID-SECRET`) `[CITED: plaid.com/docs/api/sandbox]`. Use headers so request-body logging can never leak them. `Content-Type: application/json`.

### `/link/token/create` for Hosted Link
Fields verified `[CITED: plaid.com/docs/api/link, plaid.com/docs/link/hosted-link, plaid.com/docs/statements]`:
- `user.client_user_id` (required, min length 1): "Personally identifiable information, such as an email address or phone number, should not be used" → use the `connections.id` UUID.
- `client_name` (firm name), `country_codes: ["US"]`, `language: "en"`, `webhook: "https://<worker>/api/webhooks/plaid"`.
- `products: ["transactions"]`; `transactions: { days_requested: 200..730 }` — "Minimum: 1, Maximum: 730, Default: 90". Recommend **365** (≥ 200 as locked; costs only sync time).
- `required_if_supported_products: ["statements"]` + `statements: { start_date, end_date }` ("You can request up to two years of data"). Recommend `start_date` = first day of the month 7 months ago, `end_date` = today (one month of padding per PITFALLS C6). Statements "is required to be extracted if the financial institution supports the product, but will not block the user from progressing if statements are not supported. Instead… you will receive a `PRODUCTS_NOT_SUPPORTED` error when calling Statements endpoints."
- `hosted_link: { completion_redirect_uri, url_lifetime_seconds, is_mobile_app?: false }` — "To enable the session for Hosted Link, send this object in the request. It can be empty."
  - `url_lifetime_seconds`: must be positive, "Cannot be longer than 21 days"; default "30 minutes" when Plaid is not delivering the URL. Use **1800**.
  - `completion_redirect_uri`: "Plaid will call this URI whether the user successfully completed the session" — so **it fires on exit too** and must never mark the bank connected. The hosted_link field description does **not** say it must be in the Allowed redirect URIs list (that sentence belongs to the top-level OAuth `redirect_uri`) `[CITED: plaid.com/docs/api/link]`; treat as MEDIUM and add the return URL to the Dashboard allowlist anyway — it is free and removes the risk. Query params on `completion_redirect_uri` are not addressed in the docs → put the nonce in the **path** (`/c/return/<nonce>`), not a query string `[ASSUMED]`.
  - `delivery_method` is **omitted** (Link Delivery is beta and "ignored in Sandbox").
- Response: `{ link_token, expiration, hosted_link_url, request_id }`; `hosted_link_url` is "Only present if the session is enabled for Hosted Link"; for Hosted Link "the token expires with the Hosted Link URL".
- Top-level OAuth `redirect_uri` is not needed for Hosted Link opened in a browser (Plaid hosts the OAuth return). Only set it if `is_mobile_app: true` ("When it is `true`, `redirect_uri` is required") — not our case.

### Completion: `SESSION_FINISHED`, `EVENTS`, `/link/token/get`
- `LINK` / `SESSION_FINISHED` payload: `webhook_type: "LINK"`, `webhook_code: "SESSION_FINISHED"`, `status` ("Will always be `SUCCESS` or `EXITED`"), `link_session_id`, `link_token`, `public_tokens[]`, deprecated `public_token`, `user_id`, `environment` `[CITED: plaid.com/docs/api/link]`. "It is sent by default for Hosted Link flows."
- `LINK` / `EVENTS` also fires (after finish, or 5-15 min after abandonment; a session may send several, each cumulative; dedupe by `event_id`). The adapter must **accept and store** it (idempotently) and do nothing else.
- Backup: `POST /link/token/get { link_token }` → `link_sessions[].results.item_add_results[].public_token` (+ `institution`, `accounts[]`); "available for six hours after the session has completed" `[CITED: plaid.com/docs/link/hosted-link; assets/add-to-app code sample]`. Prefer `results` over deprecated `on_success`.
- Exchange: `POST /item/public_token/exchange { public_token }` → `{ access_token, item_id, request_id }` `[CITED: plaid.com/docs/auth/coverage/database]`. Do it in the consumer immediately after `SESSION_FINISHED`/`token/get` (public tokens are short-lived).

### Transactions
- `POST /transactions/sync { access_token, cursor?, count? (max 500) }` → `{ added[], modified[], removed[], has_more, next_cursor, transactions_update_status }` `[CITED: plaid.com/docs/api/products/transactions]`.
- Loop: first call with no cursor; while `has_more` call again with `next_cursor`; **preserve the original cursor** and restart from it on `TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION` (HTTP 400); persist `next_cursor` only when `has_more` is false.
- The first `/transactions/sync` call "activate[s] the Item for the `SYNC_UPDATES_AVAILABLE` webhook"; expect **zero transactions** on it. Then wait for `TRANSACTIONS` / `SYNC_UPDATES_AVAILABLE` with `initial_update_complete: true` (last 30 days) and later `historical_update_complete: true` (full `days_requested`). `transactions_update_status` (`NOT_READY | INITIAL_UPDATE_COMPLETE | HISTORICAL_UPDATE_COMPLETE`) is the **reconcile-friendly** equivalent for missed webhooks.
- Staff UI must show "syncing" until `HISTORICAL_UPDATE_COMPLETE`, never "0 transactions" (PITFALLS M4).

### Statements
- `POST /statements/list { access_token }` → `accounts[]{ account_id, account_mask, account_name, account_official_name, account_type, account_subtype, statements[]{ statement_id, month, year } }`, `institution_id`, `institution_name`, `item_id` `[CITED: plaid.com/docs/statements]`.
- `POST /statements/download { statement_id }` → **binary PDF**; response header `Plaid-Content-Hash` is a SHA-256 of the file — store it as `documents.sha256` and verify after download `[CITED: plaid.com/docs/api/products/statements]`.
- `POST /statements/refresh { access_token, start_date, end_date }` → `{ request_id }`; completion via `STATEMENTS` / `STATEMENTS_REFRESH_COMPLETE { item_id, result: SUCCESS|FAILURE, environment }`. "Plaid uses the statement posted date to determine if a statement falls within the range." Initial statements for the link-token window are extracted during Link, so the first consumer job can call `/statements/list` directly; `/statements/refresh` is for the staff Refresh button and the monthly top-up.
- Unsupported institution → `PRODUCTS_NOT_SUPPORTED` on Statements endpoints → mark every account `not_supported` and open the manual upload path (BANK-03).
- Sandbox: "Statements can be tested in Sandbox, where a mock statement is returned"; teams created in 2023 or earlier may need a product access request `[CITED: plaid.com/docs/statements]`.
- Billing: statements are billed at Item creation for the requested window (PITFALLS C6) — the window choice is a cost decision.

### Item lifecycle
- `POST /item/remove { access_token }` → `{ request_id }` `[CITED: plaid.com/docs/api/items]`. Transactions is subscription-billed per Item until removed (PITFALLS C11). Cron job: `connections where provider='plaid' and state in ('done','error') and remove_after <= now()` → `/item/remove` → `state='removed'`, delete `connection_secrets` row, `events` entry. Default `remove_after = created_at + 30 days` (BANK-06), configurable per firm.
- `ITEM` / `ERROR` with `error.error_code = "ITEM_LOGIN_REQUIRED"` (and `PENDING_DISCONNECT`, `USER_PERMISSION_REVOKED`) → connection `error` with a "client must reconnect" message; no silent retry `[CITED: plaid.com/docs/api/items]`.

### Webhook verification
`[CITED: plaid.com/docs/api/webhooks/webhook-verification]`
1. Header `Plaid-Verification` holds a JWT; header `{ "alg": "ES256", "kid": "…", "typ": "JWT" }`. Reject any `alg` other than `ES256`.
2. `POST /webhook_verification_key/get { key_id: kid }` → `{ key }` (JWK, `kty: EC`, `crv: P-256`); cache by `kid` (module-level `Map`; Workers isolates may recycle it, which is fine).
3. `jose.jwtVerify(jwt, await importJWK(key, 'ES256'), { maxTokenAge: '5 min' })`.
4. `sha256(rawBody)` hex === `payload.request_body_sha256` with a constant-time compare; "The `request_body_sha256` is sensitive to whitespace" — hash the **exact bytes** received.
Plaid webhooks carry no event id → `event_key = sha256(rawBody)` (ARCHITECTURE §3).

### Sandbox tooling
`[CITED: plaid.com/docs/api/sandbox, plaid.com/docs/quickstart]`
- Hosted Link in Sandbox with `user_good` / `pass_good` (2FA code `1234`) completes a real session and fires a real `SESSION_FINISHED`.
- `POST /sandbox/public_token/create { institution_id, initial_products, options: { webhook, override_username, override_password, transactions: { days_requested }, statements: { start_date, end_date } } }` creates an Item **without Link UI** → use it in integration tests to get an `access_token` for sync/statement tests.
- `POST /sandbox/item/fire_webhook { access_token, webhook_code, webhook_type? }` — `webhook_code` ∈ `DEFAULT_UPDATE, NEW_ACCOUNTS_AVAILABLE, SMS_MICRODEPOSITS_VERIFICATION, USER_PERMISSION_REVOKED, USER_ACCOUNT_REVOKED, PENDING_DISCONNECT, RECURRING_TRANSACTIONS_UPDATE, LOGIN_REPAIRED, SYNC_UPDATES_AVAILABLE, PRODUCT_READY, ERROR`. **`SESSION_FINISHED` and `STATEMENTS_REFRESH_COMPLETE` are not fireable** → those handlers are proven by recorded fixtures + a real sandbox Link session.
- `POST /sandbox/item/reset_login { access_token }` forces `ITEM_LOGIN_REQUIRED` (tests the error path). Sandbox Items also enter this state automatically after 30 days.

## Q2. Truv facts (orders, Bridge, webhooks, reports, sandbox)

Confidence: **MEDIUM-HIGH** — read from docs.truv.com via Context7 (`/websites/truv`) and direct fetch today; none executed.

### Hosts and auth
- "All API requests use the `https://prod.truv.com/v1/` base URL, regardless of the environment. Your Access Secret determines the active environment" (sandbox / development / production; sandbox secrets look like `sandbox-…`) `[CITED: docs.truv.com/reference]`.
- Headers on every call: `X-Access-Client-Id`, `X-Access-Secret` `[CITED: docs.truv.com/reference/introduction]`.
- Development env "Limited to 50 successful Tasks, not billed"; Production bills per successful Task.

### `POST /v1/orders/`
`[CITED: docs.truv.com/api-reference/orders/orders_create]`
- Required: `products[]` (use `["income", "employment"]`; allowed also `deposit_switch, pll, insurance, transactions, assets, education`), `first_name`, `last_name` (≤ 50).
- Optional we use: `email`, `phone` ("A 10-digit US number; accepted formats are normalized and stored as E.164"), `external_user_id` (≤ 512; "If not provided, order_number will be used for backwards compatibility") → set to the ResSpark `request_items.id`; `notification_settings: { suppress_user_notifications: true }` (we deliver our own link; Truv must not text the client — no-own-SMS decision), `template_id` (Dashboard template that enables the Documents data source), `employers[]` (≤ 5 per order, each may carry `company_name`, `start_date`, `end_date`, `company_address`, `company_mapping_id` e.g. `self_employed`, `data_sources[]` ∈ `payroll, docs, insurance, financial_accounts, tax`).
- 201 response: `id`, `bridge_token`, `share_url`, `user_id`, `products`, `created_at`, `expired_at`, `is_expired`, `user_consent_at`, `employers[]{ id, product_type, status, link_id, data_source, bridge_token, pdf_report, provider{…}, employments[] }`.
- `employers[].status` ∈ `pending, sent, completed, error, canceled, expired, no_data, skipped`.
- Default order expiry is **72 hours**, configurable in the Dashboard (1 day … 12 weeks) `[CITED: docs.truv.com/docs/orders-guide]`. Set it to ≥ 2 weeks to match the 14-day client link, or show "request expired, ask your agent to resend" (PITFALLS M5).
- `GET /v1/orders/{id}/` returns the same shape — this is the **reconcile read**.
- `POST /v1/orders/{id}/employers/` adds an employer to an active order (not expired/canceled) `[CITED: docs.truv.com/reference/order-add-new-employer]` — staff "add another employer" without a new order.

### Bridge (client side)
`[CITED: docs.truv.com/docs/embedded-orders]`
```html
<script src="https://cdn.truv.com/bridge.js"></script>
TruvBridge.init({ isOrder: true, bridgeToken, position: { type: 'dialog' },
  onLoad() {}, onEvent(type, payload, source) {}, onClose() {}, onSuccess() {} })
```
- Order-page events arrive in `onEvent` with `source === 'order'`: `LOAD`, `SUCCESS`, `COMPLETED`, `CLOSE`; connection-widget events have `source === 'bridge'`.
- **`COMPLETED` "marks the order's final state, where all connections succeeded or were skipped."** Docs: do **not** advance the user on `onSuccess`/`onClose` "because the order may still have pending connections." So the SPA calls `POST /api/c/items/:id/reconcile` on `COMPLETED` (and harmlessly on close), never sets status itself.
- Multi-employer: "In an open order, the user can skip pre-populated employers and add new ones" — an order created **without** `employers[]` is open and lets the client connect several employers in one session; each becomes an `employers[]` entry with its own `link_id`. Sandbox login `multiple.employments` / `goodpassword` = "Multiple employments with different employers" `[CITED: docs.truv.com/docs/implementation-income-and-employment]`.
- Documents fallback inside Bridge: the order supports a **Documents data source** ("Document upload verification (pay stubs, W-2s, tax forms)") for `income`/`employment`; enable via the template or `employers[].data_sources: ["payroll","docs"]` `[CITED: docs.truv.com/docs/embedded-orders; orders_create schema]`. Exact in-widget button text is not documented `[ASSUMED]`. Keep the ResSpark-side upload (Phase 3 component) as the guaranteed PAY-03 path regardless.
- CSP: `frame-src my.truv.com; script-src cdn.truv.com` — "missing CSP configuration is a common cause of the widget failing to load."
- Alternative open: `share_url` is a Truv-hosted landing page; prefer embedding so the client stays in our step list `[ASSUMED: preference]`.

### Webhooks
`[CITED: docs.truv.com/docs/webhooks, docs.truv.com/api-reference/webhooks]`
- Header `X-WEBHOOK-SIGN` = `"v1=" + hex(HMAC-SHA256(key = Access Secret, message = raw request body))`. "Ensure you're using your **Access Secret** (not Client ID)"; "Always verify signatures using the raw request body." → **no separate `TRUV_WEBHOOK_SECRET` is needed**; `TRUV_SECRET` is the key. Constant-time compare.
- Delivery: respond 2xx within **10 seconds**; 4xx/5xx retried **3 times at 30-second intervals**; 3xx followed. After a **full day** with no 2xx an email goes to the account owner; **"An endpoint still failing three days after that email is disabled, and delivery stops." "Events sent while it is disabled are not replayed." "Truv never re-enables it automatically."** Re-enable in Dashboard → Development → Web Hooks or `PATCH /v1/webhooks/{id}/`; `GET /v1/webhooks/` lists endpoints with `env_type` `[CITED: docs.truv.com/reference/webhooks_list, webhooks_partial_update]`. Daily cron health check: alert if our endpoint is missing/disabled.
- Ordering: "Webhooks are delivered in event order" but network delays happen; "Use the `event_created_at` field to sequence events correctly"; fetch authoritative state from the API.
- Payloads: `task-status-updated { webhook_id, event_type, updated_at, task_id, link_id, product, tracking_info, status }`; `order-status-updated { webhook_id, order_id, order_number, employer_id, product, data_source, link_id, event_type, event_created_at, updated_at, status, user_id, template_id }`. **`webhook_id` is the idempotency key.** Also available: `link-connected`, `link-disconnected`, `statements-created`, `employment-created`, etc.; subscribe to `task-status-updated` and `order-status-updated` only.
- Sandbox: "Configure webhook endpoints separately for Sandbox and Production"; every status transition fires `task-status-updated`; `order-status-updated` fires on terminal states. Task statuses documented: `done`, `login_error`, `mfa_error`, `config_error` (others like `login`, `mfa`, `full_parse` appear in examples but are not enumerated → map unknown statuses to `in_progress`).

### Reports and files
`[CITED: docs.truv.com/reference/income_verification, employment_verification, list-documents]`
- `GET /v1/links/{link_id}/income/report/` → `{ id, status, finished_at, access_token, is_suspicious, refresh_status, provider, data_source, pdf_report (URI), employments[]{ id, company{ name, address, phone, ein }, is_active, job_title, job_type, start_date, end_date, income, income_unit, pay_rate, pay_frequency, statements[]{ pay_date, check_number, gross_pay, net_pay, hours, earnings, deductions, …ytd, file (URI, "format is specified in the content-type"), md5sum }, w2s[]{ file (URI), year, md5sum, wages, federal_tax, … }, annual_income_summary[] } }`.
- `GET /v1/links/{link_id}/employment/report/` → employments with `is_active`, `job_title`, `start_date`, `end_date`, `provider`.
- `GET /v1/links/{link_id}/documents/` → `[{ id, type (PAYSTUB | W2 | F1099), subtype, file, filename, mimetype, created_at }]` — the user-uploaded documents.
- Each `employers[]` entry in the order has its own `link_id`; call the reports per link and store one `payroll_employments` row per `(order_id, employer_id, link_id)` so two jobs and a 1099 are just more rows (PAY-02).
- **File URL expiry is not documented** on the pages read; the brief's "1-hour pre-signed URL" is `[ASSUMED]`. Design for it anyway: download `file`/`pdf_report` into Storage **inside the same consumer job** that fetched the report; never store the vendor URL for later.
- Document sizes/types: pay stubs "PDF", W-2 "when available"; no size limits documented.

## Q3. Webhook / queue / reconcile framework on Workers

Confidence: **HIGH** for platform behavior (Cloudflare docs), **MEDIUM** for the SQL design (our own).

### Raw body in Hono
`const raw = await c.req.text()` returns the exact body string; Hono caches the body so a later `JSON.parse(raw)` is free and `cloneRawRequest` exists if a middleware consumed it `[CITED: hono.dev/docs/api/request]`. Never call `c.req.json()` or a validator before verification (Plaid's hash is whitespace-sensitive; Truv signs the raw bytes). Do not mount `@hono/standard-validator` on the webhook route.

### `webhook_events` idempotency
```sql
create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('plaid','truv','docuseal')),
  event_key text not null,            -- plaid: sha256(raw); truv: webhook_id; docuseal: sha256(raw)
  payload jsonb not null, headers jsonb,  -- headers allowlisted: plaid-verification, x-webhook-sign only
  received_at timestamptz not null default now(),
  status text not null default 'queued' check (status in ('queued','processing','done','dead','ignored')),
  attempts int not null default 0, last_error text, processed_at timestamptz,
  unique (provider, event_key));
revoke all on webhook_events from anon, authenticated;
alter table webhook_events enable row level security;
```
`record_webhook(p_provider, p_key, p_payload)` = `insert … on conflict (provider, event_key) do nothing returning id`; `null` ⇒ duplicate ⇒ respond 200 and do not enqueue (ARCHITECTURE §3). A crash between insert and `send` is healed by cron re-enqueueing rows `status='queued' and received_at < now() - interval '2 minutes'`.

### Queue config and handler
`[CITED: developers.cloudflare.com/workers/llms-full.txt (Queues configuration), developers.cloudflare.com/queues/platform/limits]`
```jsonc
"queues": {
  "producers": [{ "queue": "resspark-jobs", "binding": "JOBS" }],
  "consumers": [{ "queue": "resspark-jobs", "max_batch_size": 1, "max_batch_timeout": 5,
                  "max_retries": 8, "retry_delay": 60, "dead_letter_queue": "resspark-jobs-dlq",
                  "max_concurrency": 3 }]
}
```
- `dead_letter_queue` "is created automatically" if missing; `retry_delay` is the default delay for retried messages; explicit `message.retry({ delaySeconds })` overrides per message (cap **24 h**); `message.ack()` marks success; `batch.retryAll()` exists. Limits: message 128 KB (send only ids, never payloads), `max_retries` ≤ 100, batch ≤ 100, `max_batch_timeout` ≤ 60 s, consumer wall-clock 15 min, CPU 30 s default (raise with `limits.cpu_ms` up to 5 min), retention up to 14 days on Paid.
- Backoff: `msg.retry({ delaySeconds: Math.min(60 * 2 ** msg.attempts, 86400) })` (STACK.md §5). On the final attempt the message lands in `resspark-jobs-dlq`; a tiny DLQ consumer (second `consumers[]` entry with `queue: "resspark-jobs-dlq"`) sets `webhook_events.status='dead'` / `jobs.status='dead'` so the admin health panel shows it.
- Job message shape (≤ 128 KB): `{ type: 'webhook'|'reconcile'|'sync_transactions'|'download_statements'|'fetch_payroll'|'remove_item', provider, ref: string, attempt?: number }` — the consumer re-reads everything else from Postgres.

### Cron
`scheduled(controller, env, ctx)` with `controller.cron` to branch if more than one trigger is added `[CITED: developers.cloudflare.com/workers/runtime-apis/handlers/scheduled]`. Phase 1 set `*/15 * * * *`; SUMMARY asks for 5-minute reconcile → change to `*/5 * * * *` (one trigger, cheap). Each run: (1) re-enqueue stuck `webhook_events`; (2) `reconcile` for `connections` in `in_progress`/`connected` where `coalesce(last_webhook_at,last_polled_at) < now() - interval '5 minutes'` and `created_at > now() - interval '3 days'`, backing off to 30 min after 1 h; (3) `remove_item` for Plaid connections past `remove_after`; (4) daily: Truv `GET /v1/webhooks/` health check. Local test: `curl "http://localhost:5173/cdn-cgi/local/scheduled?cron=*/5+*+*+*+*"` `[CITED: 01-RESEARCH Q2]`.

### Monotonic transitions (WEBH-03)
```sql
create or replace function status_rank(s text) returns int language sql immutable as $$
  select case s when 'created' then 0 when 'pending' then 10 when 'in_progress' then 20
                when 'connected' then 30 when 'syncing' then 40 when 'done' then 50
                when 'error' then 45  -- error can be overwritten by later progress but never regresses done
                when 'removed' then 60 else -1 end $$;

create or replace function apply_connection_transition(p_connection uuid, p_new text, p_source text, p_detail jsonb)
returns table (applied boolean, state text) language plpgsql security definer set search_path = public as $$
declare cur text;
begin
  select c.state into cur from connections c where c.id = p_connection for update;
  if cur is null then raise exception 'connection not found'; end if;
  if status_rank(p_new) < status_rank(cur) and not (cur = 'error' and status_rank(p_new) >= status_rank('connected')) then
    return query select false, cur; return;        -- out-of-order event: ignore
  end if;
  update connections set state = p_new, last_polled_at = now(), error = case when p_new='error' then p_detail else null end where id = p_connection;
  perform log_event(/* firm_id, case_id, request_id */ …, 'provider', p_source, 'connection.' || p_new, p_detail);
  return query select true, p_new;
end $$;
revoke all on function apply_connection_transition(uuid,text,text,jsonb) from public, anon, authenticated;
```
Design notes: the function is `security definer` so only the Worker (service role) can call it, and it lives in `public` only because `supabase db query` migrations target it; **revoke `execute` from `public`** per the Supabase skill. The `error` rank sits below `done` so a stale `error` cannot undo completion, and a later `connected`/`done` can clear an `error` (`ITEM_LOGIN_REQUIRED` then repaired). `request_items.status` is derived from its connection by the same RPC (pending/in_progress/submitted). `[ASSUMED: design, not vendor fact]`

### Reconcile = one function
`reconcileConnection(connId)` is called by the webhook consumer, the cron, the client `POST /api/c/items/:id/reconcile` (on Bridge `COMPLETED` / Hosted Link return), and staff `POST /api/admin/connections/:id/refresh`. Plaid: if no access token yet → `/link/token/get` (6 h window) → exchange; else `/transactions/sync` status + `/statements/list` (+ `/statements/refresh` when staff press Refresh). Truv: `GET /v1/orders/{id}/` → per employer with `link_id` and `status='completed'` → income/employment reports → documents → rows. Both end in `apply_connection_transition`.

## Q4. Encrypting provider access tokens at rest

Confidence: **HIGH** for Web Crypto availability `[CITED: developers.cloudflare.com/workers/runtime-apis/web-crypto]`; design is ours.

- Key: `TOKEN_ENC_KEY_1` Worker secret = 32 random bytes base64 (`openssl rand -base64 32`), imported once per isolate with `crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt','decrypt'])`.
- Per row: 12-byte random IV, `AES-GCM` with `additionalData = connection_id` bytes (binds ciphertext to its row), store `iv || ciphertext` in `connection_secrets.secret_enc bytea`, `key_id smallint` for rotation.
```sql
create table connection_secrets (
  connection_id uuid primary key references connections(id) on delete cascade,
  secret_enc bytea not null, key_id smallint not null default 1, created_at timestamptz default now());
alter table connection_secrets enable row level security;   -- zero policies, zero grants
revoke all on connection_secrets from anon, authenticated;
```
- Decrypt only inside provider calls in the Worker; never return, log, or include in queue messages. Rotation: add `TOKEN_ENC_KEY_2`, a cron re-encrypts rows with `key_id=1`. For Truv, store nothing: the API key is the only credential and Truv `link.access_token` values are not needed for the order/report endpoints used here `[ASSUMED]`.
- Supabase's own encryption at rest still applies (vendor assurance); this adds application-level protection against a leaked DB read.

## Q5. Supabase Storage from the Worker

Confidence: **MEDIUM-HIGH** `[CITED: supabase.com/docs/guides/storage/buckets/creating-buckets, guides/storage/serving/downloads, guides/functions/storage-caching]`.

- Create the private bucket in the migration: `insert into storage.buckets (id, name, public) values ('case-documents', 'case-documents', false) on conflict do nothing;` — or `supabase.storage.createBucket('case-documents', { public: false, allowedMimeTypes: ['application/pdf','image/jpeg','image/png'], fileSizeLimit: '25MB' })` from a script. `allowedMimeTypes`/`fileSizeLimit` are bucket columns (`allowed_mime_types`, `file_size_limit`) and can be set in the same SQL `[ASSUMED: column names]`. Phase 3 may already create this bucket; reuse it if so.
- Upload with the secret-key client: `await supabase.storage.from('case-documents').upload(path, bodyArrayBuffer, { contentType: 'application/pdf', upsert: false })`. Body may be `ArrayBuffer | Blob | ReadableStream`. Path convention: `firm/<firm_id>/case/<case_id>/plaid/<item_id>/<account_id>/<year>-<month>.pdf`, `…/truv/<order_id>/<employer_id>/paystub-<pay_date>.pdf`, `…/w2-<year>.pdf`.
- Staff preview: `createSignedUrl(path, 300)` → `data.signedUrl` (5-minute TTL; signed URLs use a separate internal signing key). Serve via `GET /api/admin/documents/:id/url` so the firm scope is enforced in the Worker.
- Private bucket + RLS on `storage.objects` with **no** policies for `anon`/`authenticated`: only the secret key can read/write, matching Phase 1 D-12.
- After upload insert `documents(source='plaid'|'truv', request_item_id, size_bytes, sha256, scan_status='skipped_trusted')` and, for statements, `statement_months(status='available', document_id)`.

## Q6. Client-side: scripts, open strategy, CSP, consent

Confidence: **MEDIUM**.

- Truv: load `https://cdn.truv.com/bridge.js` via a `useScript` hook (no npm package `[CITED: STACK.md]`), init with `isOrder: true`, dialog mode; on `onEvent('COMPLETED', _, 'order')` call reconcile and show "Payroll connected"; on close call reconcile and show the real state.
- Plaid Hosted Link: `window.location.assign(hosted_link_url)` in the **same tab** on mobile (pop-ups are unreliable in iOS Safari and in-app browsers; Plaid itself recommends Hosted Link over webviews) `[ASSUMED: UX choice; docs do not prescribe tab behavior]`. Return route `/c/return/<nonce>`: the Worker validates the single-use nonce against `connections.return_nonce`, redirects to `/c/` with the bank step highlighted, and the SPA polls `GET /api/c/state` (5-10 s) while showing "Finishing up…". **The return never sets state** (fires on exit too).
- CSP for `/c/*` (Phase 2 owns the header; extend here): `script-src 'self' https://cdn.truv.com; frame-src https://my.truv.com; connect-src 'self' https://*.truv.com` `[CITED: docs.truv.com/docs/embedded-orders for Truv hosts]`. Hosted Link is a full navigation to `secure.plaid.com`, so **no Plaid CSP entry is needed**; `cdn.plaid.com` is only required for embedded Link (not used) `[ASSUMED]`.
- Consent screen (BANK-05): one "Use of data" statement reused verbatim in the Plaid Dashboard Link customization, privacy policy, and vendor applications (PITFALLS C7). Plaid DTM: use cases are configured per Link customization (≤ 3, ≥ 1); Link shows the data scopes for the union of `products`, `optional_products`, `required_if_supported_products`, `additional_consented_products`; products not consented return `ADDITIONAL_CONSENT_REQUIRED` `[CITED: plaid.com/docs/link/data-transparency-messaging-migration-guide]`. Whether DTM renders inside Hosted Link is not stated → `[ASSUMED: yes, Hosted Link is Link]`. Our screen states: what (6 months of transactions and bank statements; pay stubs, W-2s, employment and income data), why ("to prepare your IRS tax paperwork, including Form 433-A, for review by <firm>"), who receives it (<firm>, stored in ResSpark and the firm's case system), retention (removed from the bank connection after 30 days; documents per firm policy), and a checkbox. `consents(id, firm_id, case_id, request_item_id, kind in ('bank','payroll'), text_version, accepted_at, ip, user_agent)` written by the `start` RPC **before** the link token / order is created; the same row satisfies Truv's FCRA "written instructions" expectation for employment reports (PITFALLS C7) `[ASSUMED: legal sufficiency — counsel decides]`.

## Q7. Teller (interface shaping only)

Confidence: **LOW-MEDIUM**.

- mTLS: "mTLS is required for all API requests that involve end-user data", i.e. all requests in development and production; optional in sandbox `[CITED: teller.io/docs/api/authentication via WebSearch]`. Workers support `mtls_certificates` bindings (ARCHITECTURE §5).
- Account sub-resources documented: `details`, `balances`, `transactions` (payments beta); endpoints `GET /accounts`, `GET /accounts/:id`, `DELETE /accounts/:id`. **No statements or PDF endpoint appears on the accounts page** `[CITED: teller.io/docs/api/accounts]` — this is an **absence**, so `statementPdfs: false` for Teller is `[ASSUMED]` until Teller confirms in writing.
- Interface consequence: `capabilities: { transactions: true, statementPdfs: boolean, hostedLink: boolean }`; Teller = `{ transactions: true, statementPdfs: false, hostedLink: false }` (Teller Connect is embedded) → the UI keys the manual-statement fallback and the open strategy off capabilities, never off `provider.id`. Keep the Phase 8 adapter out of scope; only the type and the Plaid implementation ship now.

## Architecture Patterns

### System Architecture Diagram

```
Client phone (/c/*, cookie rs_client)                       Staff SPA (/admin/*, Bearer JWT)
   │ 1. tap "Connect bank" / "Connect payroll"                   │ Refresh / preview
   ▼                                                              ▼
POST /api/c/items/:id/start ──► RPC start_connection() ──► consents + connections(state='pending', provider, link_token_ref|order_id)
   │                                      │
   │ 2. Worker calls vendor               ▼
   │   Plaid /link/token/create ──► hosted_link_url      Truv POST /v1/orders/ ──► bridge_token
   ▼
Browser: location.assign(hosted_link_url)  |  TruvBridge.init({isOrder:true})
   │ client completes at vendor                                   
   ├──► Plaid completion_redirect_uri → GET /c/return/<nonce> (no state change; poll)
   ├──► Bridge onEvent COMPLETED → POST /api/c/items/:id/reconcile
   │
Vendor webhook ──► POST /api/webhooks/:provider
   │ raw = c.req.text(); adapter.verify(raw, headers)  ✗ → 401
   │ record_webhook(provider, event_key) → inserted? ──► env.JOBS.send({type:'webhook', provider, ref})  → 200 (<1 s)
   ▼
queue(batch) consumer ──► reconcileConnection(connId)
   │  plaid: SESSION_FINISHED/token/get → exchange → AES-GCM → connection_secrets
   │         /transactions/sync loop → bank_transactions;  /statements/list → download → Storage → documents + statement_months
   │  truv:  GET /v1/orders/{id}/ → per employer link → income/employment reports → files → Storage → payroll_employments + documents
   ▼  apply_connection_transition(conn, new_state, source, detail)  (monotonic, writes events)
   │  failure → msg.retry(backoff) ×8 → resspark-jobs-dlq → status='dead' (admin health panel)
scheduled() every 5 min ──► re-enqueue stuck webhook_events; reconcile stale in-progress connections; /item/remove past window; daily Truv webhook health
```

### Recommended Project Structure (additions to Phase 1 layout)
```
app/worker/src/
├── routes/webhooks.ts              # POST /api/webhooks/:provider (generic)
├── routes/client-connections.ts    # /api/c/items/:id/start | reconcile | upload-statement ; GET /c/return/:nonce
├── routes/admin-connections.ts     # refresh, statement status, signed document URLs
├── webhooks/{types,plaid,truv}.ts  # WebhookAdapter { id, verify(raw, headers, env), eventKey(verified, raw) }
├── providers/bank/types.ts         # BankProvider, capabilities, LinkStart, Norm* types
├── providers/bank/plaid/{client,link,transactions,statements,webhook}.ts   # fetch wrappers, each < 150 lines
├── providers/bank/index.ts         # bankProvider(connection.provider)
├── providers/truv/{client,orders,reports,webhook}.ts
├── jobs/{index,reconcile,plaid-sync,plaid-statements,truv-fetch,remove-items,dlq}.ts
├── crypto/token-vault.ts           # AES-GCM seal/open (+ .test.ts)
├── db/{connections,webhook-events,documents,statement-months,payroll}.ts
└── cron.ts                         # scheduled() dispatcher
app/src/features/client-portal/{consent-screen,bank-step,payroll-step,statement-upload}.tsx
app/src/features/admin/case/{connections-panel,statement-grid,payroll-panel}.tsx
app/src/lib/use-script.ts           # cdn.truv.com loader
supabase/migrations/0005_connections.sql   # connections, connection_secrets, webhook_events, consents, bank_accounts, bank_transactions, statement_months, payroll_employments, status_rank, RPCs
docs/app/worker/src/**              # companion .md per file (CLAUDE.md)
```

### Pattern 1: Webhook as hint, reconcile as truth
**What:** verify → idempotent insert → enqueue → consumer re-reads provider state → monotonic RPC. **When:** every provider event; also cron and the Refresh button. **Why:** Plaid's `completion_redirect_uri` fires on exit, Truv can disable the endpoint with no replay, both can reorder; one code path absorbs all of it `[CITED: ARCHITECTURE.md §3]`.

### Pattern 2: Row before URL
**What:** `start_connection()` inserts `connections` (with `link_token_ref` / `order_id` placeholder) **before** calling the vendor, then updates it with the vendor refs, then returns the URL. **Why:** a `SESSION_FINISHED` can arrive seconds after the client finishes; `link_token` is the only correlation key Plaid gives you `[CITED: ARCHITECTURE.md §3 "Race to avoid"]`.

### Pattern 3: Capability-keyed UI
**What:** `BankProvider.capabilities` drives the statement grid ("not supported by this bank" vs manual upload) and the open strategy. **When:** every bank screen. **Why:** Teller lacks statements and Hosted Link; the UI must not branch on `provider.id` (PITFALLS M3).

### Pattern 4: Download-in-job
**What:** every vendor file URL (`statements[].file`, `w2s[].file`, `pdf_report`, `/statements/download`) is fetched and written to Storage inside the same consumer job that discovered it; only Storage paths are persisted. **Why:** vendor URLs expire (Truv expiry undocumented; DocuSeal 40 min per PITFALLS C13) and `/statements/download` is a POST with credentials.

### Anti-Patterns to Avoid
- **Parsing before verifying:** `c.req.json()` or a validator on the webhook route re-serializes the body and breaks Plaid's hash and Truv's HMAC.
- **Trusting the redirect:** marking the bank connected on `/c/return/<nonce>`; it fires on exit.
- **Trusting `onSuccess`/`onClose` from Bridge:** the order may still have pending connections; only `COMPLETED` (and the API) count.
- **`status = payload.status`:** replays and reordering regress state; always go through `apply_connection_transition`.
- **Queue payloads carrying tokens or files:** 128 KB limit and a leak vector; send ids only.
- **`days_requested` left at default:** 90 days is immutable for the Item's life.
- **`statements` in `products`:** blocks linking at unsupported banks; must be `required_if_supported_products`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ES256 JWT verification | Manual ECDSA over Web Crypto | `jose` `importJWK` + `jwtVerify({ maxTokenAge })` | Already a dependency; Plaid's own sample |
| Constant-time compare | Char-by-char loop | `crypto.subtle.timingSafeEqual` (Workers) | Documented, non-standard but present |
| Retry/backoff/DLQ | Custom retry tables + cron | Queue `max_retries`, `retry_delay`, `message.retry({delaySeconds})`, `dead_letter_queue` | Platform handles visibility and ordering |
| Idempotency | In-memory sets | Postgres `unique (provider, event_key)` + `on conflict do nothing` | Survives isolates and redeploys |
| Transactions pagination | Offset paging | `/transactions/sync` cursor loop with preserved cursor on `MUTATION_DURING_PAGINATION` | Plaid's documented algorithm |
| Statement month math | Parsing PDF text for dates | `/statements/list` `month`/`year` + `Plaid-Content-Hash` | Authoritative, free |
| Payroll parsing | OCR of pay stubs | Truv income/employment reports (`statements[]`, `w2s[]`) | Structured, per employer |
| Signed download links | Own token scheme | `storage.createSignedUrl(path, 300)` | Built-in, short TTL |

**Key insight:** every vendor in this phase already exposes the authoritative state over a GET; the only code worth writing is the glue that re-reads it and the monotonic rule that applies it.

## Runtime State Inventory

Not applicable — greenfield additions (new tables, new routes, new jobs); no rename/refactor/migration of existing runtime state. Verified: `supabase/migrations/` currently holds only the baseline (Phase 1 `0002` pending), `storage.buckets` has 0 rows (01-RESEARCH F-7), no Queues exist yet (F-2).

## Common Pitfalls

### Pitfall 1: Two `LINK` webhooks per session
**What goes wrong:** the adapter expects only `SESSION_FINISHED`, receives `EVENTS` (or `SESSION_FINISHED` with `status: "EXITED"`) and either 500s (Plaid retries forever) or marks the bank connected.
**How to avoid:** `plaid.verify()` returns `{ webhook_type, webhook_code, status }`; the consumer treats `LINK/EVENTS` and `EXITED` as `ignored` (stored, acked), and only `SUCCESS` with non-empty `public_tokens[]` triggers exchange. Fixture tests for all three.
**Warning signs:** `webhook_events` rows with `last_error` on `EVENTS`; connections "connected" with no `connection_secrets` row.

### Pitfall 2: Sandbox cannot fire the two webhooks you most need
**What goes wrong:** the plan relies on `/sandbox/item/fire_webhook` to test `SESSION_FINISHED` and `STATEMENTS_REFRESH_COMPLETE`; neither is in the allowed `webhook_code` list.
**How to avoid:** prove them with (a) recorded JSON fixtures (exact bytes, with a locally-signed ES256 JWT whose JWK is injected into the key cache) and (b) one real Sandbox Hosted Link run per demo rehearsal. Use `fire_webhook` for `SYNC_UPDATES_AVAILABLE`, `ERROR`, `PENDING_DISCONNECT`.

### Pitfall 3: Truv endpoint silently disabled
**What goes wrong:** a bad deploy returns 500 for a day → email → three days later Truv disables the endpoint; no events ever again.
**How to avoid:** the webhook route returns 200 for duplicates and `ignored` events, 401 only for bad signatures (never 500 for parse errors — store raw and let the consumer fail); cron reconciles orders regardless; daily `GET /v1/webhooks/` check; `PATCH /v1/webhooks/{id}/` runbook in `docs/`.

### Pitfall 4: Statement months do not line up with calendar months
**What goes wrong:** 6 months yields 5 or 7 PDFs; the newest month is not posted; staff ask "where is March".
**How to avoid:** `statement_months` is keyed by `(account_id, year, month)` for the 6 target months and padded one month either side in the Plaid window; status per cell `available | pending | not_supported | uploaded_manually | missing`; the client step shows "Upload your <Month> statement" only for `missing`/`not_supported` cells.

### Pitfall 5: First `/transactions/sync` returns nothing
**What goes wrong:** staff see "0 transactions" and think the connection failed.
**How to avoid:** connection sub-state `syncing` until `transactions_update_status = HISTORICAL_UPDATE_COMPLETE`; UI badge "Syncing (bank is sending history)".

### Pitfall 6: Hosted Link token minted at send time
**What goes wrong:** staff "send" creates the link token; client opens it next day → Plaid "link expired".
**How to avoid:** mint only on the client's tap (fresh token per tap, 1800 s); the staff-copyable link is **our** `/c/<token>` URL, never Plaid's.

### Pitfall 7: Plaid Trial cap and per-Item billing
**What goes wrong:** rehearsals burn the 10 Production Items (PITFALLS C7) or leave Items billing monthly.
**How to avoid:** Sandbox only until Phase 8; `remove_after` cron from day one; admin "Remove bank connection now" action.

### Pitfall 8: `security definer` RPC callable by `public`
**What goes wrong:** `apply_connection_transition` in `public` is executable by `anon` by default.
**How to avoid:** `revoke execute … from public, anon, authenticated` in the same migration; RLS test asserts PostgREST `rpc/apply_connection_transition` with the publishable key returns 401/404 (Supabase skill checklist).

## Code Examples

### 1. Plaid fetch client (`providers/bank/plaid/client.ts`)
```ts
// Source: plaid.com/docs/api (hosts; PLAID-CLIENT-ID / PLAID-SECRET headers)
const HOSTS = { sandbox: 'https://sandbox.plaid.com', production: 'https://production.plaid.com' } as const
export type PlaidEnv = keyof typeof HOSTS
export const plaidFetch = (env: Env) => async <T>(path: string, body: Record<string, unknown>): Promise<T> => {
  const res = await fetch(`${HOSTS[env.PLAID_ENV as PlaidEnv]}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'PLAID-CLIENT-ID': env.PLAID_CLIENT_ID, 'PLAID-SECRET': env.PLAID_SECRET },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new PlaidError(res.status, await res.json())   // { error_type, error_code, error_message, request_id }
  return res.json() as Promise<T>
}
// binary variant for /statements/download: return res (read .arrayBuffer(), res.headers.get('Plaid-Content-Hash'))
```

### 2. Hosted Link token (`providers/bank/plaid/link.ts`)
```ts
// Source: plaid.com/docs/link/hosted-link, plaid.com/docs/statements, plaid.com/docs/api/link
export const createHostedLink = (env: Env, p: { connectionId: string; firmName: string; returnUrl: string; webhookUrl: string; months: number }) =>
  plaidFetch(env)<{ link_token: string; hosted_link_url: string; expiration: string }>('/link/token/create', {
    user: { client_user_id: p.connectionId },          // opaque id, no PII
    client_name: p.firmName, country_codes: ['US'], language: 'en', webhook: p.webhookUrl,
    products: ['transactions'],
    transactions: { days_requested: 365 },             // >= 200 (locked); immutable per Item
    required_if_supported_products: ['statements'],
    statements: { start_date: firstOfMonthMinus(p.months + 1), end_date: today() },
    hosted_link: { completion_redirect_uri: p.returnUrl, url_lifetime_seconds: 1800 },
  })
```

### 3. Plaid webhook verification (`webhooks/plaid.ts`)
```ts
// Source: plaid.com/docs/api/webhooks/webhook-verification (jose sample), developers.cloudflare.com web-crypto
import { importJWK, jwtVerify, decodeProtectedHeader } from 'jose'
const keys = new Map<string, JsonWebKey>()
export async function verifyPlaid(raw: string, headers: Headers, env: Env): Promise<unknown | null> {
  const jwt = headers.get('plaid-verification'); if (!jwt) return null
  const { alg, kid } = decodeProtectedHeader(jwt); if (alg !== 'ES256' || !kid) return null
  if (!keys.has(kid)) {
    const { key } = await plaidFetch(env)<{ key: JsonWebKey }>('/webhook_verification_key/get', { key_id: kid })
    keys.set(kid, key)
  }
  let payload: { request_body_sha256?: string }
  try { ({ payload } = await jwtVerify(jwt, await importJWK(keys.get(kid)!, 'ES256'), { maxTokenAge: '5 min' })) } catch { return null }
  const digest = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)))
  const claimed = payload.request_body_sha256 ?? ''
  if (claimed.length !== digest.length || !crypto.subtle.timingSafeEqual(enc(digest), enc(claimed))) return null
  return JSON.parse(raw)
}
export const plaidEventKey = (raw: string) => sha256Hex(raw)   // Plaid has no event id
```

### 4. Truv webhook verification (`webhooks/truv.ts`)
```ts
// Source: docs.truv.com/docs/webhooks — X-WEBHOOK-SIGN: "v1=" + hex(HMAC-SHA256(Access Secret, raw body))
export async function verifyTruv(raw: string, headers: Headers, env: Env): Promise<{ webhook_id: string } | null> {
  const sig = headers.get('x-webhook-sign'); if (!sig?.startsWith('v1=')) return null
  const key = await crypto.subtle.importKey('raw', enc(env.TRUV_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const expected = 'v1=' + hex(await crypto.subtle.sign('HMAC', key, enc(raw)))
  if (expected.length !== sig.length || !crypto.subtle.timingSafeEqual(enc(expected), enc(sig))) return null
  const body = JSON.parse(raw); return typeof body?.webhook_id === 'string' ? body : null
}
export const truvEventKey = (b: { webhook_id: string }) => b.webhook_id
```

### 5. Generic webhook route (`routes/webhooks.ts`)
```ts
// Source: ARCHITECTURE.md §3 handler shape; hono.dev/docs/api/request (c.req.text())
export const webhooksRoute = new Hono<{ Bindings: Env }>().post('/:provider', async (c) => {
  const adapter = adapters[c.req.param('provider')]; if (!adapter) return c.notFound()
  const raw = await c.req.text()                                   // raw FIRST; no validator on this route
  const verified = await adapter.verify(raw, c.req.raw.headers, c.env)
  if (!verified) return c.text('invalid signature', 401)
  const id = await db.recordWebhook(c.env, adapter.id, adapter.eventKey(verified, raw), verified)
  if (id) await c.env.JOBS.send({ type: 'webhook', provider: adapter.id, ref: id })
  return c.text('ok', 200)                                         // duplicates also 200
})
```

### 6. Queue consumer and DLQ (`jobs/index.ts`)
```ts
// Source: developers.cloudflare.com/queues (message.ack / retry / dead_letter_queue), STACK.md §5 backoff
export const queue: ExportedHandler<Env, Job>['queue'] = async (batch, env) => {
  if (batch.queue === 'resspark-jobs-dlq') { for (const m of batch.messages) { await db.markDead(env, m.body); m.ack() } return }
  for (const m of batch.messages) {
    try { await runJob(env, m.body); m.ack() }
    catch (err) { log.error({ job: m.body.type, attempt: m.attempts, error_code: codeOf(err) })
                  m.retry({ delaySeconds: Math.min(60 * 2 ** m.attempts, 86_400) }) }
  }
}
```

### 7. Plaid `/transactions/sync` loop (`providers/bank/plaid/transactions.ts`)
```ts
// Source: plaid.com/docs/api/products/transactions (cursor loop, MUTATION_DURING_PAGINATION)
export async function syncAll(env: Env, accessToken: string, startCursor: string | null) {
  for (;;) {
    let cursor = startCursor; const added = [], modified = [], removed = []
    try {
      for (let more = true; more;) {
        const r = await plaidFetch(env)<SyncResponse>('/transactions/sync', { access_token: accessToken, cursor, count: 500 })
        added.push(...r.added); modified.push(...r.modified); removed.push(...r.removed)
        more = r.has_more; cursor = r.next_cursor; if (!more) return { added, modified, removed, cursor, status: r.transactions_update_status }
      }
    } catch (e) { if (!(e instanceof PlaidError && e.code === 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION')) throw e }  // restart from startCursor
  }
}
```

### 8. Statement download → Storage (`jobs/plaid-statements.ts`)
```ts
// Source: plaid.com/docs/api/products/statements (binary + Plaid-Content-Hash); supabase storage upload / createSignedUrl
const list = await plaidFetch(env)<StatementsList>('/statements/list', { access_token })
for (const acct of list.accounts) for (const s of acct.statements) {
  if (await db.statementExists(env, conn.id, acct.account_id, s.year, s.month)) continue
  const res = await plaidRaw(env, '/statements/download', { statement_id: s.statement_id })
  const bytes = await res.arrayBuffer(); const hash = res.headers.get('Plaid-Content-Hash')
  if (hash && hash !== hex(await crypto.subtle.digest('SHA-256', bytes))) throw new Error('statement hash mismatch')
  const path = `firm/${firm}/case/${caseId}/plaid/${list.item_id}/${acct.account_id}/${s.year}-${pad(s.month)}.pdf`
  const { error } = await supabase.storage.from('case-documents').upload(path, bytes, { contentType: 'application/pdf', upsert: false })
  if (error && !isAlreadyExists(error)) throw error
  await db.insertDocumentAndMonth(env, { conn, acct, s, path, sha256: hash, size: bytes.byteLength })
}
```

### 9. Token vault (`crypto/token-vault.ts`)
```ts
// Source: developers.cloudflare.com/workers/runtime-apis/web-crypto (AES-GCM supported)
const key = async (env: Env) => crypto.subtle.importKey('raw', b64(env.TOKEN_ENC_KEY_1), 'AES-GCM', false, ['encrypt', 'decrypt'])
export async function seal(env: Env, plaintext: string, aad: string): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc(aad) }, await key(env), enc(plaintext)))
  return concat(iv, ct)                                   // store as bytea with key_id = 1
}
export async function open(env: Env, sealed: Uint8Array, aad: string): Promise<string> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.slice(0, 12), additionalData: enc(aad) }, await key(env), sealed.slice(12))
  return new TextDecoder().decode(pt)
}
```

### 10. Truv order + Bridge (`providers/truv/orders.ts`, `features/client-portal/payroll-step.tsx`)
```ts
// Source: docs.truv.com/api-reference/orders/orders_create; docs.truv.com/docs/embedded-orders
export const createOrder = (env: Env, p: { itemId: string; first: string; last: string; email?: string; phone?: string }) =>
  truvFetch(env)<TruvOrder>('/v1/orders/', { method: 'POST', body: {
    products: ['income', 'employment'], first_name: p.first, last_name: p.last, email: p.email, phone: p.phone,
    external_user_id: p.itemId, notification_settings: { suppress_user_notifications: true } } })
// client:
const bridge = TruvBridge.init({ isOrder: true, bridgeToken,
  onEvent: (type, _payload, source) => { if (source === 'order' && type === 'COMPLETED') void reconcile(itemId) },
  onClose: () => void reconcile(itemId) })
bridge.open()
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `/transactions/get` with date ranges | `/transactions/sync` cursor + `SYNC_UPDATES_AVAILABLE` | Plaid guidance since 2022; `transactions_update_status` added for recovery | Use sync only |
| `on_success.public_token` from `/link/token/get` | `results.item_add_results[]` | Multi-Item Link | `on_success` deprecated |
| Embedded Link + OAuth `redirect_uri` re-init | Hosted Link with `completion_redirect_uri` | Hosted Link GA | No OAuth re-initialization code |
| Plaid `webhook_type`-less payloads | `user_id` added to most webhooks (2026-02-18 changelog) | 2026-02 | Ignore unless Plaid Users are adopted |
| Truv `order_number` as external id | `external_user_id` (order_number kept for compatibility) | current docs | Use `external_user_id` |
| `@cloudflare/vitest-pool-workers` | `@cloudflare/vitest-plugin` 1.4.0 | 2026 | Already in Phase 1 |

**Deprecated/outdated:** Plaid `public_token` (singular) in `SESSION_FINISHED` → use `public_tokens[]`; Truv `completed_at` on reports (deprecated format) → use `finished_at`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `completion_redirect_uri` does not need Dashboard registration and tolerates a path-embedded nonce | Q1 | Hosted Link rejects the token or strips the nonce → mitigate by registering the exact return URL and falling back to polling without a nonce |
| A2 | DTM disclosures render inside Hosted Link sessions | Q6 | Consent evidence relies on our screen alone (already required) |
| A3 | Truv `file` / `pdf_report` URLs are short-lived (~1 h) | Q2 | None if we download in-job as designed |
| A4 | Teller has no statement PDF endpoint (absence on docs page) | Q7 | Capability flag flips to `true` in Phase 8; interface unchanged |
| A5 | Truv in-widget "add employer" / document upload UX exists as described for open orders with `data_sources` incl. `docs` | Q2 | PAY-01/PAY-03 still met by server-side `POST /v1/orders/{id}/employers/` and our own upload component |
| A6 | `storage.buckets` columns `allowed_mime_types`, `file_size_limit` settable via SQL insert | Q5 | Use `createBucket()` from a script instead |
| A7 | Same-tab navigation to Hosted Link is the best mobile UX | Q6 | Switch to `window.open` on desktop only; no data impact |
| A8 | `status_rank` ordering (`error` < `done`, repairable) matches how Andrew wants error vs done displayed | Q3 | Rank table edit in one SQL function |
| A9 | Our consent row satisfies Truv's FCRA "written instructions" expectation | Q6 | Counsel review (Phase 9); text may need strengthening |
| A10 | No Plaid CSP entries are needed because Hosted Link is a full navigation | Q6 | Add `connect-src`/`frame-src` for `*.plaid.com` if a Plaid script is ever embedded |
| A11 | `url_lifetime_seconds: 1800` is accepted (docs say "positive", max 21 days) | Q1 | Any positive value works; no risk |

## Open Questions

1. **Which Plaid Dashboard Link customization / use cases are configured?**
   - What we know: ≤ 3 use cases per customization, shown via DTM; products need not match.
   - What's unclear: none is configured yet (no Plaid account access in repo).
   - Recommendation: user creates the Sandbox customization with the "tax preparation" wording before demo; plan a `checkpoint:human-verify`.
2. **Truv order expiry and template.**
   - Known: default 72 h, Dashboard-configurable; Documents data source via template.
   - Unclear: whether the sandbox account has a template with `docs` enabled.
   - Recommendation: create a template "ResSpark payroll" (income + employment, payroll + docs) and pass its `template_id` from a Worker var.
3. **Does the repo's Phase 3 upload component already create the private bucket and `documents` columns (`source`, `sha256`, `scan_status`)?**
   - Phase 1-3 have not executed yet (no `app/` directory exists). Plan Phase 4 migrations as `if not exists` / additive and reference Phase 3's names in its PLAN.
4. **Route prefix:** phase description says `/webhooks/:provider`, ROADMAP/ARCHITECTURE say `/api/webhooks/:provider`, Phase 1 `run_worker_first` lists both `/api/*` and `/webhooks/*`. Recommendation: **`/api/webhooks/:provider`** (matches ARCHITECTURE and avoids a second asset-bypass glob); keep `/webhooks/*` in `run_worker_first` harmlessly or remove it.
5. **Statements product access in Sandbox** for a newly created Plaid team — should be on by default (2023-or-earlier teams need a request). Verify on first `/statements/list`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | Worker build/tests | ✓ | v24.14.0 `[VERIFIED: local]` | — |
| pnpm | app/ installs | ✓ | 10.32.1 `[VERIFIED: local]` | — |
| wrangler | deploy, secrets, queues | ✓ | 4.149.0 (authenticated) `[VERIFIED: local; 01-RESEARCH F-12]` | — |
| Cloudflare Workers Paid | Queues retention, 30 s CPU | ✓ | `workers_paid` active `[CITED: 01-CONTEXT D-06 update]` | — |
| Supabase CLI | migrations via `db query --linked` | ✓ (per 01-RESEARCH F-10/F-12) | 2.120.0 | `supabase --version` printed nothing in this shell; use `npx supabase` or the path Phase 1 records |
| Supabase project `zvkphuikjpwoauqdimcf` | tables, Storage | ✓ | Postgres 17.6 | — |
| `app/` Worker skeleton, migrations 0002-0004, client shell, upload component | everything in this phase | ✗ **not built yet** (Phases 1-3 are still in planning) | — | None — Phase 4 plans must depend on Phase 1-3 outputs; executing out of order is blocked |
| Plaid Sandbox credentials (`PLAID_CLIENT_ID`, `PLAID_SECRET`) | BANK-* | ✗ | — | None for live tests; fixture-based unit tests still run |
| Truv Sandbox credentials (`TRUV_CLIENT_ID`, `TRUV_SECRET`) | PAY-* | ✗ | — | Same |
| `TOKEN_ENC_KEY_1` | BANK-02 | ✗ (user generates) | — | None |
| Public HTTPS Worker URL for webhooks | WEBH-* | ✓ once Phase 1 deploys `resspark.<sub>.workers.dev` | — | `wrangler dev` + a tunnel for local webhook tests |
| `.env` reading | — | blocked by Bash secret guard (D-08) | — | `npx -y dotenv-cli -- …` |

**Missing dependencies with no fallback:** Phase 1-3 artifacts (sequencing, not tooling); vendor credentials for any live sandbox flow. The plan must list these `wrangler secret put` steps for the user:
```
npx -y dotenv-cli -- npx wrangler secret put PLAID_CLIENT_ID
npx -y dotenv-cli -- npx wrangler secret put PLAID_SECRET
npx -y dotenv-cli -- npx wrangler secret put TRUV_CLIENT_ID
npx -y dotenv-cli -- npx wrangler secret put TRUV_SECRET          # also the webhook HMAC key
npx -y dotenv-cli -- npx wrangler secret put TOKEN_ENC_KEY_1      # openssl rand -base64 32
```
`PLAID_ENV` (`sandbox`) and `TRUV_TEMPLATE_ID`, `PLAID_REMOVE_AFTER_DAYS=30` are plain `vars`, not secrets. No `TRUV_WEBHOOK_SECRET` exists as a separate concept. Add the five names to `wrangler.jsonc` `secrets.required` and mirror them in `app/.dev.vars.example`.

**Missing dependencies with fallback:** none.

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json` `[VERIFIED: read this session]`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.3 with `projects`: `worker` (`@cloudflare/vitest-plugin` 1.4.0, real Queue/secret bindings) and `web` (jsdom) `[CITED: 01-CONTEXT D-21]` |
| Config file | `app/vitest.config.ts`, `app/worker/vitest.config.ts` — created by Phase 1 (Wave 0 here only if Phase 1 slipped) |
| Quick run command | `pnpm -C app vitest run --project worker worker/src/webhooks worker/src/providers` |
| Full suite command | `pnpm -C app check` (file-size gate, `tsc -b`, eslint, `vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WEBH-01 | Plaid JWT + body-hash verification accepts recorded fixture, rejects tampered body / wrong `alg` / stale `iat` | unit (fixtures: raw bytes + JWT signed by a test P-256 key injected into the key cache) | `vitest run worker/src/webhooks/plaid.test.ts` | ❌ Wave 0 |
| WEBH-01 | Truv `v1=` HMAC accepts fixture, rejects wrong secret / missing prefix | unit | `vitest run worker/src/webhooks/truv.test.ts` | ❌ Wave 0 |
| WEBH-01 | Duplicate delivery inserts once and enqueues once; second POST returns 200 | integration (Hono `app.request()` + live Supabase or msw'd PostgREST) | `vitest run worker/test/webhooks-idempotency.test.ts` | ❌ Wave 0 |
| WEBH-01 | Route responds < 1 s without awaiting vendor calls | integration (timer around `app.request`) | same file | ❌ |
| WEBH-01 | Consumer retries with backoff and lands in DLQ after `max_retries` | integration (Workers plugin: `env.JOBS` + failing job) | `vitest run worker/test/queue-dlq.test.ts` | ❌ Wave 0 |
| WEBH-02 | `reconcileConnection` with msw-mocked Plaid `/link/token/get` + exchange heals a connection that never got `SESSION_FINISHED` | integration | `vitest run worker/test/reconcile-plaid.test.ts` | ❌ |
| WEBH-02 | Cron `scheduled()` re-enqueues stuck `webhook_events` and stale connections | integration (`scheduled` invoked via the plugin's `SELF.scheduled` or `cdn-cgi/local/scheduled`) | `vitest run worker/test/cron.test.ts` | ❌ |
| WEBH-03 | `apply_connection_transition('done' → 'pending')` returns `applied=false` and keeps `done`; `error` → `connected` applies | SQL/integration against live project | `vitest run worker/test/status-rank.test.ts` | ❌ |
| PAY-01 | `createOrder` sends `products`, `external_user_id`, `suppress_user_notifications`; sandbox `multiple.employments` yields ≥ 2 `employers[]` | unit (msw) + manual sandbox | unit: `vitest run worker/src/providers/truv/orders.test.ts`; manual: Bridge with `multiple.employments`/`goodpassword` | ❌ |
| PAY-02 | Report fixture with two employers produces two `payroll_employments` rows and downloads `statements[].file`, `w2s[].file` into Storage paths | integration (msw serves report + PDF bytes) | `vitest run worker/test/truv-fetch.test.ts` | ❌ |
| PAY-03 | Payroll step renders "Can't find your employer? Upload pay stubs / W-2s" and the upload posts to the same `request_item` | web unit (RTL) | `vitest run --project web src/features/client-portal/payroll-step.test.tsx` | ❌ |
| PAY-04 | Status mapping `pending/sent → pending`, `completed → done`, `error/expired → error`, unknown task status → in_progress | unit | `vitest run worker/src/providers/truv/status.test.ts` | ❌ |
| BANK-01 | `createHostedLink` body has `days_requested >= 200`, `required_if_supported_products: ['statements']`, `hosted_link.url_lifetime_seconds <= 1800`; each `start` creates a new `connections` row and token | unit (msw) | `vitest run worker/src/providers/bank/plaid/link.test.ts` | ❌ |
| BANK-02 | `SESSION_FINISHED SUCCESS` fixture → exchange → sealed token stored (decrypts to the same value) → sync loop (3 pages, one `MUTATION_DURING_PAGINATION`) → statements downloaded with hash check | integration (msw) | `vitest run worker/test/plaid-complete.test.ts` | ❌ |
| BANK-02 | `EXITED` and `LINK/EVENTS` fixtures are stored as `ignored`, no exchange | unit | `vitest run worker/src/webhooks/plaid.test.ts` | ❌ |
| BANK-03 | `PRODUCTS_NOT_SUPPORTED` from `/statements/list` marks all 6 months `not_supported`; manual upload flips a month to `uploaded_manually` | integration + web unit | `vitest run worker/test/statement-months.test.ts` | ❌ |
| BANK-04 | `bankProvider(conn)` returns Plaid for `provider='plaid'`; a stub provider with `statementPdfs:false` makes the grid show upload for every month | unit | `vitest run worker/src/providers/bank/index.test.ts` | ❌ |
| BANK-05 | `start` RPC refuses without a `consents` row for the item; consent screen blocks the button until checked | integration + web unit | `vitest run worker/test/consent-gate.test.ts` | ❌ |
| BANK-06 | Cron removes connections past `remove_after`, calls `/item/remove` (msw), deletes the secret, logs an event | integration | `vitest run worker/test/remove-items.test.ts` | ❌ |
| WEBH-01/BANK-02 (live) | Real Sandbox Hosted Link with `user_good`/`pass_good` → webhook received → statements and transactions appear in admin | manual-only (needs Plaid Sandbox keys and a deployed URL) | checklist in PLAN `checkpoint:human-verify` | — |
| WEBH-01 (live) | `/sandbox/item/fire_webhook` with `SYNC_UPDATES_AVAILABLE` and `ERROR` reaches the deployed route and is processed | manual/scripted (`app/scripts/plaid-fire-webhook.mjs`) | manual | — |

### Sampling Rate
- **Per task commit:** `pnpm -C app vitest run --project worker <changed dir>`
- **Per wave merge:** `pnpm -C app check`
- **Phase gate:** full suite green + the two manual sandbox checklists executed before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `app/worker/test/fixtures/plaid/{session_finished_success,session_finished_exited,link_events,sync_updates_available,statements_refresh_complete,item_error}.json` + `plaid-sign.ts` helper (ES256 test key, builds `Plaid-Verification`)
- [ ] `app/worker/test/fixtures/truv/{task_status_updated,order_status_updated,order_two_employers,income_report_two_employers}.json` + `truv-sign.ts` (`v1=` HMAC with the test secret)
- [ ] `app/worker/test/helpers/msw-vendors.ts` (Plaid and Truv handlers incl. binary `/statements/download`)
- [ ] `app/worker/src/webhooks/*.test.ts`, `app/worker/src/crypto/token-vault.test.ts` (round-trip + AAD mismatch fails)
- [ ] `supabase/migrations/0005_connections.sql` must exist before the SQL/integration tests run
- [ ] If Phase 1 did not deliver `app/vitest.config.ts` with the `worker` project: framework install per 01-RESEARCH (`pnpm add -D vitest@5.0.3 @cloudflare/vitest-plugin@1.4.0 msw@3.0.3`)

## Security Domain

`security_enforcement: true`, ASVS level 1 `[VERIFIED: .planning/config.json]`.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Staff routes: Phase 1 `jose` JWT check; client routes: `rs_client` cookie from the link exchange; webhooks: vendor signatures (Plaid ES256 JWT, Truv HMAC) |
| V3 Session Management | yes | Single-use `return_nonce` on `/c/return/:nonce`; fresh Plaid link token per tap (≤ 1800 s); Truv order expiry aligned to link expiry |
| V4 Access Control | yes | Every `/api/c/*` query scoped by the verified link's `request_id`; `/api/admin/*` by `firm_id`; RLS on all new tables with zero `anon`/`authenticated` policies; `revoke execute` on `security definer` RPCs |
| V5 Input Validation | yes | Zod on `start`/`upload-statement` bodies; webhook payloads parsed only after signature; type guards on every vendor response |
| V6 Cryptography | yes | Web Crypto AES-GCM (random 12-byte IV, AAD = connection id) for access tokens; HMAC-SHA256 and `timingSafeEqual` for Truv; `jose` for ES256 — never hand-rolled |
| V7 Error Handling & Logging | yes | Allowlisted logger (D-20): never raw webhook bodies, tokens, or `/c/<token>`; `webhook_events.payload` stored without `Plaid-Verification`/`X-WEBHOOK-SIGN` values beyond what is needed |
| V8 Data Protection | yes | Private Storage bucket, 5-minute signed URLs via the Worker only; `connection_secrets` service-role only; Item removal after 30 days; `documents.retain_until` |
| V12 Files & Resources | yes | Magic-byte check (`%PDF-`) on downloaded statements and uploads; `fileSizeLimit` on the bucket; `Plaid-Content-Hash` verification |
| V13 API & Web Services | yes | Webhook route: 401 on bad signature, 200 on duplicates, no 500 on parse; rate-limit per IP (Phase 1 binding) |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged "bank connected" webhook | Spoofing | Signature verification on raw body before any DB write; vendor key fetched by `kid` from Plaid, Access Secret for Truv |
| Replayed old webhook regresses state | Tampering | `unique (provider, event_key)` + `status_rank` monotonic RPC + `iat` ≤ 5 min (Plaid) |
| Redirect-based completion spoof (`/c/return/<nonce>` with guessed nonce) | Spoofing | 128-bit single-use nonce; the return route never changes state |
| Access-token theft via DB read or backup | Information disclosure | AES-GCM with a Worker-only key; `key_id` rotation; no token in logs/queues |
| Cross-case document access via signed URL | Information disclosure | URLs minted only by the Worker after firm/case scope check; 5-minute TTL |
| Queue poison message loops | Denial of service | `max_retries: 8`, DLQ, `max_concurrency: 3`, idempotent jobs |
| Truv endpoint disabled → stuck requests | Denial of service (availability) | Cron reconcile; daily `GET /v1/webhooks/` check; runbook |
| Secrets in the browser | Information disclosure | Only `bridge_token` and `hosted_link_url` reach the SPA; both are vendor-scoped, short-lived |
| PII in `client_user_id` | Information disclosure | Use the connection UUID (Plaid explicitly forbids email/phone there) |

## Sources

### Primary (HIGH confidence)
- Context7 `/llmstxt/plaid_llms_txt` — `/link/token/create` (fields, `days_requested` 1-730, `required_if_supported_products`, `statements`), Hosted Link (`url_lifetime_seconds`, `completion_redirect_uri`, response), `/link/token/get`, `SESSION_FINISHED`, webhook verification (jose sample, process, JWT header), `/transactions/sync` (loop, `MUTATION_DURING_PAGINATION`, `transactions_update_status`), Statements (`/list` response, `/download` binary + `Plaid-Content-Hash`, `/refresh`, `STATEMENTS_REFRESH_COMPLETE`, Sandbox mock), `/item/remove`, `ITEM ERROR`, sandbox credentials
- Direct fetch `plaid.com/docs/link/hosted-link/`, `plaid.com/docs/api/link/` (both halves), `plaid.com/docs/api/sandbox/` — `url_lifetime_seconds` max 21 days, `completion_redirect_uri` fires on exit, `SESSION_FINISHED.status ∈ {SUCCESS, EXITED}`, `EVENTS` webhook, `fire_webhook` allowed codes, `/sandbox/public_token/create` options
- Context7 `/websites/truv` — `POST /v1/orders/`, `GET /v1/orders/{id}/`, `POST /v1/orders/{id}/employers/`, Bridge init/events, webhook security, `task-status-updated`/`order-status-updated` payloads, income/employment reports, `/documents/`, `GET/PATCH /v1/webhooks/`, environments and headers, test credentials (`multiple.employments`)
- Direct fetch `docs.truv.com/docs/webhooks`, `docs.truv.com/api-reference/orders/orders_create`, `docs.truv.com/reference/income_verification`, `docs.truv.com/docs/embedded-orders`, `docs.truv.com/developers/testing/test-credentials` — `v1=` hex HMAC with Access Secret, retry/disable rules, `event_created_at`, order field constraints, report file fields, `COMPLETED` semantics, CSP hosts, sandbox logins
- Context7 `/llmstxt/developers_cloudflare_workers_llms-full_txt` + fetch `developers.cloudflare.com/queues/platform/limits/`, `…/workers/runtime-apis/web-crypto/` — consumer config, `ack/retry/retryAll`, `scheduled`, limits, AES-GCM/HMAC/`timingSafeEqual`
- Context7 `/websites/hono_dev` — `c.req.text()`, `cloneRawRequest`
- Context7 `/supabase/supabase`, `/websites/supabase` — bucket SQL insert, `createBucket` options, `upload`, `createSignedUrl`, private bucket access model
- Repo: `.planning/REQUIREMENTS.md`, `ROADMAP.md`, `PROJECT.md`, `research/{SUMMARY,ARCHITECTURE,PITFALLS,STACK}.md`, `phases/01-…/01-CONTEXT.md`, `01-RESEARCH.md`, `STATE.md`, `CLAUDE.md`, `.agents/skills/supabase/SKILL.md`, `.planning/config.json`

### Secondary (MEDIUM confidence)
- `plaid.com/docs/link/data-transparency-messaging-migration-guide/` — DTM use-case rules (Hosted Link applicability not stated)
- npm registry reads (`npm view`) and `gsd-tools query package-legitimacy check` for `jose`, `hono`, `@supabase/supabase-js`, `msw`
- Firecrawl developer/web search: `plaid/pattern`, `plaid/tutorial-resources`, `truvhq/demo-react-native` as pattern references

### Tertiary (LOW confidence)
- WebSearch summary of `teller.io/docs/api/authentication` (mTLS) and fetch of `teller.io/docs/api/accounts` (no statements endpoint listed — absence only)
- Truv document URL expiry (not found in docs; brief's "1 hour" unconfirmed)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; versions re-read today
- Plaid facts: MEDIUM-HIGH — official docs read today; nothing executed (no keys)
- Truv facts: MEDIUM-HIGH — official docs read today; Bridge UX details partly undocumented
- Webhook/queue framework: HIGH on platform behavior; MEDIUM on our SQL design (unproven until Wave 0 tests)
- Encryption/Storage: HIGH on primitives; MEDIUM on bucket SQL column names
- Teller: LOW (absence-based)

**Research date:** 2026-10-10
**Valid until:** 2026-11-10 for Plaid/Truv API shapes (stable), 7 days for sandbox tooling claims and package versions
