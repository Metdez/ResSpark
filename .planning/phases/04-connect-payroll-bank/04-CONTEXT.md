# Phase 4: Connect Payroll & Bank - Context

**Gathered:** 2026-10-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 4 adds the two connect steps to the client portal and the machinery that makes them reliable: a generic, signature-verified, idempotent webhook route with a queue consumer and cron reconciler; Truv payroll connection (multi-employer) with pay stubs, W-2s, and income/employment data landing in the case; Plaid bank connection via Hosted Link opened from the portal with 6 months of transactions and available statement PDFs, per-account statement status, manual-upload fallback, consent, encrypted token storage, a capability-based `BankProvider` interface, and Item removal after a window. Requirements: WEBH-01..03, PAY-01..04, BANK-01..06. Logics push, address, e-sign, and Teller are later phases.

</domain>

<decisions>
## Implementation Decisions

Discussion ran in `--auto` mode. Every decision follows `04-RESEARCH.md` (verified against Plaid, Truv, Cloudflare, and Supabase docs on 2026-10-10) and `.planning/research/SUMMARY.md` conflicts 4 and 5. Override here before planning if needed.

### Webhook, queue, reconcile framework (WEBH)
- **D-01:** One route `POST /api/webhooks/:provider` (prefix `/api/webhooks`, resolving the research's prefix conflict in favor of ROADMAP/ARCHITECTURE). The handler reads the raw body text once, verifies the provider signature, inserts into `webhook_events (provider, event_key UNIQUE per provider, received_at, payload jsonb, processed_at, status)`, enqueues `{provider, event_id}` on `resspark-jobs`, and returns 200 within one second. Duplicate `event_key` → 200 without enqueue. Unverifiable signature → 401 and an `events` row `webhook.rejected` with no payload.
- **D-02:** Signature verification per provider: Plaid — `Plaid-Verification` ES256 JWT verified against `/webhook_verification_key/get` (keys cached by `kid`), `iat` within 5 minutes, body SHA-256 equals `request_body_sha256`; Truv — `X-WEBHOOK-SIGN` equals `"v1=" + hex(HMAC-SHA256(TRUV_SECRET, rawBody))` compared with `timingSafeEqual`; event key = Truv `webhook_id`, Plaid `link_session_id` + `webhook_code` (or `item_id` + `webhook_code` + timestamp for item webhooks). DocuSeal is added in Phase 6 through the same route.
- **D-03:** Queue consumer (`queue()` export) processes one event per message: re-reads provider state from the provider API (never trusts the payload alone), applies a monotonic status transition through a SQL function `connection_set_status(id, new_status)` that uses a `status_rank` table so out-of-order events never regress a step (WEBH-03), and writes the event. `ack()` after processing; `retry({ delaySeconds })` with exponential backoff only for transient provider errors; `max_retries: 5`, `dead_letter_queue: resspark-jobs-dlq`; a DLQ message writes `events` row `job.dead_lettered`.
- **D-04:** Reconciler: a cron (`*/15 * * * *`) job lists connections with non-terminal status older than 10 minutes and re-reads provider state; the same function backs `POST /api/admin/connections/:id/refresh` (staff Refresh button) and a client-triggered reconcile when the portal returns from a provider. This is a correctness requirement because Truv disables failing webhook endpoints without replay.

### Truv payroll (PAY)
- **D-05:** `POST /api/c/connections/payroll/start` creates a Truv order server-side (`POST https://prod.truv.com/v1/orders/` with `products: ["income"]`, first/last name, email, phone, `external_user_id` = request id, `notification_settings.suppress_user_notifications: true` (we deliver the link; Truv does not text), `order_number` = request id) and returns the `bridge_token`; the portal loads `https://cdn.truv.com/bridge.js` and calls `TruvBridge.init({ isOrder: true, bridgeToken })`. Multiple employers are added inside the same order (sandbox login `multiple.employments` proves it). Completion is only the `onEvent('COMPLETED', _, 'order')` signal plus the `order-status-updated` webhook; `onSuccess`/`onClose` never advance state.
- **D-06:** On `task-status-updated: done` / order completion, the consumer fetches `GET /v1/orders/{id}/`, then per employer link `GET /v1/links/{link_id}/income/report/` and the uploaded-documents endpoint, downloads pay stubs and W-2 files (pre-signed URLs expire in 1 hour, so download in the same job), stores them in the `case-documents` bucket under `.../payroll/{employer}/`, writes `documents` rows (kind `pay_stub` | `w2` | `income_report`), stores the structured report JSON in `connections.data jsonb`, and marks the payroll `request_item` `submitted`.
- **D-07:** A client who cannot find their employer uses the same upload step component from Phase 3 inside the payroll step ("Upload pay stubs instead"), satisfying PAY-03 without a second upload path.

### Plaid bank (BANK)
- **D-08:** `POST /api/c/connections/bank/start` creates a fresh Plaid link token per tap: `products: ["transactions"]`, `required_if_supported_products: ["statements"]`, `statements: { start_date: today-180d, end_date: today }`, `transactions: { days_requested: 365 }`, `hosted_link: { completion_redirect_uri: <portal>/c/return?nonce=..., url_lifetime_seconds: 1800, is_mobile_app: false }`, `webhook: <worker>/api/webhooks/plaid`, `user.client_user_id` = request id. The portal opens `hosted_link_url` in the same tab; the return route only shows "checking your connection" and polls `/api/c/state`; it never sets state (BANK-01, SUMMARY conflict 4).
- **D-09:** Completion is `LINK` `SESSION_FINISHED` with `status: SUCCESS` and non-empty `public_tokens[]` (an `EXITED` session and the `LINK/EVENTS` webhook are recorded but do not complete). The consumer exchanges each public token, encrypts the access token with AES-GCM under Worker secret `TOKEN_ENC_KEY_1` into `connection_secrets (connection_id, key_version, ciphertext, iv)`, runs the `/transactions/sync` cursor loop into `bank_transactions`, calls `/statements/list` and `/statements/download` for every statement in the window into the bucket under `.../bank/{account_mask}/{year}-{month}.pdf`, and writes `documents` rows (kind `bank_statement`). `STATEMENTS_REFRESH_COMPLETE` and `SYNC_UPDATES_AVAILABLE` webhooks trigger incremental re-runs (BANK-02).
- **D-10:** `bank_accounts` carries per-account `statement_status` by month: `available` (downloaded), `not_supported` (institution not in Statements coverage, detected by `PRODUCT_NOT_READY`/`PRODUCTS_NOT_SUPPORTED` or an empty list after refresh), `manual` (client uploaded via the Phase 3 upload component shown inside the bank step as "Upload statements instead"). Staff see this grid in the case view (BANK-03).
- **D-11:** `BankProvider` interface in `app/worker/src/integrations/bank/provider.ts`: `{ id, capabilities: { transactions, statementPdfs, hostedLink }, createLinkSession(), completeSession(), syncTransactions(), listStatements(), downloadStatement(), removeConnection() }`; `plaid.ts` is the first implementation; `BANK_PROVIDER` var selects it; the UI reads `capabilities`, never `provider.id` (BANK-04). Teller (`mtls_certificates` binding, no statement PDFs) is Phase 8.
- **D-12:** Consent screen before Plaid opens: plain-language copy ("We'll pull up to 6 months of transactions and your monthly statements from the account you choose, to prepare your tax paperwork. We never see your bank password."), a single "I agree" tap writes `consents (link_id, kind='bank_data', text_version, agreed_at, ip_class)` and the event `consent.bank_data` (BANK-05). The same pattern (kind `payroll_data`) precedes Truv.
- **D-13:** Retention: a daily cron step calls `/item/remove` for Items whose connection completed more than `PLAID_REMOVE_AFTER_DAYS` (default 30) ago, deletes the `connection_secrets` row, and logs `connection.removed`; downloaded statements and transactions stay (BANK-06).

### Data and secrets
- **D-14:** Migration `0005_connections.sql` adds `connections` (`id`, `firm_id`, `request_id`, `request_item_id`, `provider` in plaid|truv|teller, `kind` in bank|payroll, `external_id` (Plaid item_id / Truv order id), `status` with rank, `data jsonb`, `error`, timestamps), `connection_secrets`, `bank_accounts`, `bank_transactions` (one row per Plaid transaction with `plaid_transaction_id` UNIQUE, amount, date, name, merchant, category_primary/detailed, pending), `webhook_events`, `consents`, the `status_rank` function, and RPCs `connection_set_status`, `connection_record_event`. RLS on, grants revoked, applied with `db-migrate.mjs`.
- **D-15:** Worker secrets to provision (names only; `provision-secrets.mjs` gains a `--provider` mode that reads them from the operator's shell prompt via stdin, never from a file in the repo): `PLAID_CLIENT_ID`, `PLAID_SECRET`, `TRUV_CLIENT_ID`, `TRUV_SECRET`, `TOKEN_ENC_KEY_1`; vars: `PLAID_ENV=sandbox`, `TRUV_TEMPLATE_ID` (optional), `PLAID_REMOVE_AFTER_DAYS=30`, `BANK_PROVIDER=plaid`. Until the Plaid/Truv secrets exist, `/api/c/connections/*/start` returns a clear "Provider not configured" error and the portal step shows the manual-upload fallback only; sandbox credentials are the demo path (`user_good`/`pass_good`, `goodlogin`/`goodpassword`, `multiple.employments`).
- **D-16:** CSP for the portal adds `frame-src my.truv.com cdn.plaid.com; script-src cdn.truv.com cdn.plaid.com; connect-src` for both; the admin shell is unchanged.

### Claude's Discretion
- Exact table column types for `bank_transactions`, the retry backoff schedule, the Truv template id handling, and the loading/empty copy inside the two connect steps (UI-SPEC Inherited conventions apply).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `.planning/phases/04-connect-payroll-bank/04-RESEARCH.md` — Q1..Q7 answers with exact endpoints, payloads, headers, `status_rank` SQL, AES-GCM vault, Storage calls, CSP, test fixtures; Validation Architecture; Assumptions A1..A11
- `.planning/research/SUMMARY.md` — resolved conflicts 4 (Hosted Link from our button, no Plaid-sent SMS) and 5 (days_requested, statements coverage, manual fallback)
- `.planning/research/PITFALLS.md` — C4, C5, C6, C7, C11, M3, M4, M5
- `.planning/phases/01-foundation-staff-sign-in/01-CONTEXT.md`, `01-SKELETON.md`, `01-0*-PLAN.md` — Worker layout, Queue + DLQ + cron bindings (Workers Paid), logger, `db/` module
- `.planning/phases/02-find-the-client-send-the-link/02-CONTEXT.md` and `02-0*-PLAN.md` — requests, request_items, `clientSession` middleware, portal step list and `Coming next` sheets this phase replaces for the two connect steps
- `.planning/phases/03-uploads-review-live-status/03-CONTEXT.md` and `03-0*-PLAN.md` — `documents` columns, `case-documents` bucket, upload component reused for fallbacks, review panel that shows connection documents
- `.planning/phases/01-foundation-staff-sign-in/01-UI-SPEC.md` — design contract (44 px targets, status badges, loading/empty/error conventions, voice)
- `.planning/PROJECT.md` — Andrew's wording: "two jobs, one 1099", "switched jobs two years ago", "6 months, 3 is the standard window"
- `CLAUDE.md`, `.claude/CLAUDE.md`, `.agents/skills/supabase/SKILL.md`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 1: `logEvent`, `db/` module, allowlisted logger, `wrangler.jsonc` queue/cron bindings, `provision-secrets.mjs` stdin pattern, `smoke.mjs`.
- Phase 2: `clientSession` middleware, portal step list, `request_items` status model, `/api/c/state` polling.
- Phase 3: upload sheet component (`features/uploads/*`), `documents` table and bucket helpers (`storage/case-documents.ts`), review panel, status badges, polling helper.

### Established Patterns
- Writes through RPCs that log their event; status derived in SQL; cookie-only client identity; type guards at API boundaries; companion docs per file; 500-line limit (vendored excluded).

### Integration Points
- `app/worker/src/index.ts` (webhook route, queue + scheduled exports), `wrangler.jsonc` (queue consumer settings, cron), `app/src/features/client-portal/step-list.tsx` (connect steps replace two "Coming next" sheets), `app/src/features/review/*` (connection cards and statement grid), `supabase/migrations/0005_connections.sql`.

</code_context>

<specifics>
## Specific Ideas

- Demo path: Truv sandbox `multiple.employments` showing two employers with stubs and a W-2; Plaid sandbox `user_good` showing transactions and at least one statement PDF ("First Platypus Bank"); the dashboard flips the request to "waiting on staff" within 10 seconds of the webhook.
- Staff must see both "last 3 months" and "last 6 months" at a glance in the statement grid (Zack: pull 6, standard is 3).

</specifics>

<deferred>
## Deferred Ideas

- Teller as second provider (Phase 8); income insights / asset reports beyond transactions and statements (v2); automated texting of provider links (out of scope); Plaid production access and Data Transparency Messaging configuration (Phase 8/9 production gate).

</deferred>

---

*Phase: 04-connect-payroll-bank*
*Context gathered: 2026-10-10*
