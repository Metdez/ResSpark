---
phase: 04-connect-payroll-bank
verified: 2026-10-11T19:10:00Z
status: human_needed
score: 7/10 must-haves verified
covered_files: [".planning/phases/04-connect-payroll-bank/04-01-PLAN.md", ".planning/phases/04-connect-payroll-bank/04-01-SUMMARY.md", ".planning/phases/04-connect-payroll-bank/04-02-PLAN.md", ".planning/phases/04-connect-payroll-bank/04-02-SUMMARY.md", ".planning/phases/04-connect-payroll-bank/04-03-PLAN.md", ".planning/phases/04-connect-payroll-bank/04-03-SUMMARY.md", ".planning/phases/04-connect-payroll-bank/04-04-PLAN.md", ".planning/phases/04-connect-payroll-bank/04-04-SUMMARY.md", ".planning/phases/04-connect-payroll-bank/04-05-PLAN.md", ".planning/phases/04-connect-payroll-bank/04-05-SUMMARY.md", ".planning/phases/04-connect-payroll-bank/04-06-PLAN.md", ".planning/phases/04-connect-payroll-bank/04-06-SUMMARY.md", ".planning/phases/04-connect-payroll-bank/04-07-PLAN.md", ".planning/phases/04-connect-payroll-bank/04-07-SUMMARY.md", "app/src/features/client-portal/connect/bank-step.tsx", "app/src/features/client-portal/connect/payroll-step.tsx", "app/worker/src/cron.ts", "app/worker/src/integrations/bank/provider.ts", "app/worker/src/integrations/bank/start.ts", "app/worker/src/integrations/truv/orders.ts", "app/worker/src/integrations/truv/start.ts", "app/worker/src/jobs/bank-reconcile.ts", "app/worker/src/jobs/bank-statements.ts", "app/worker/src/jobs/index.ts", "app/worker/src/jobs/payroll-reconcile.ts", "app/worker/src/jobs/reconcile.ts", "app/worker/src/jobs/remove-items.ts", "app/worker/src/routes/admin-connections.ts", "app/worker/src/routes/c-connections.ts", "app/worker/src/routes/c-return.ts", "app/worker/src/routes/c-uploads.test.ts", "app/worker/src/routes/c-uploads.ts", "app/worker/src/routes/webhooks.ts", "app/worker/src/webhooks/plaid.ts", "app/worker/src/webhooks/truv.ts", "app/worker/test/bank-manual-upload.test.ts", "supabase/migrations/0005_connections.sql"]
covered_digest: "v3:sha256:0cd76a885e1f430d2a170909610f997a8042eca5adadbee33e3d0ae041b01e19"
behavior_unverified: 3
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 5/10
  gaps_closed:
    - "A client who cannot find their employer uploads pay stubs and W-2s manually in the same step (SC1 / PAY-03)"
    - "Each connected account offers manual statement upload as a first-class fallback, and manual uploads show as 'uploaded manually' per month (SC3 / BANK-03)"
  gaps_remaining: []
  regressions: []
behavior_unverified_items:
  - truth: "SC1: a client connects payroll through a Truv order with more than one employer; staff see the income report, pay stubs and W-2s per employer; status shows in the client step and the admin card"
    test: "With Truv Sandbox keys, run the rehearsal runbook: Connect payroll, consent, Bridge with multiple.employments / goodpassword, then open the admin request page"
    expected: "The Payroll card reads Done and lists two employers with their pay stub, W-2 and income report links. The client sheet shows both employers with Done chips. The documents also appear under the item in the review panel."
    why_human: "No Truv keys exist. Order creation, report and document fetch, and Storage writes are covered only by stubbed live tests (payroll-start, payroll-fetch), which this verifier did not run (one live file allowed, used on bank-manual-upload)"
  - truth: "SC4 / WEBH-03: connection_set_status is monotonic (done never goes back to pending, error is repairable, removed is terminal, concurrent writers converge)"
    test: "Run `pnpm -C app test:live:file worker/test/connections-live.test.ts` serially on a quiet tree"
    expected: "All rank-matrix cases pass, including the concurrent connected/syncing case"
    why_human: "The SQL in 0005_connections.sql implements the rank rule correctly on reading. The only behavioral proof is the live suite, which writes fixtures to the live database. 06-08-SUMMARY claims a green serial test:live (42 files, 417 tests); this verifier did not reproduce it"
  - truth: "SC5 / BANK-06: Plaid Items older than PLAID_REMOVE_AFTER_DAYS (default 30) are removed, the secret is deleted, and documents, transactions and month cells stay"
    test: "Run `pnpm -C app test:live:file worker/test/remove-items.test.ts`"
    expected: "Removal calls /item/remove, deletes connection_secrets, sets status removed, and keeps the data rows. ITEM_NOT_FOUND counts as already removed."
    why_human: "Dispatch (cron.test.ts) and routing (jobs/index.test.ts) pass. removeItem itself is proven only by the live suite, which this verifier did not run"
human_verification:
  - test: "Sandbox rehearsal with keys (docs/app/runbooks/plaid-sandbox-rehearsal.md): secrets:provider plaid|truv with Sandbox keys, register the Plaid redirect URI and the Truv webhook, then run the README's Phase 4 demo script"
    expected: "Truv multiple.employments gives two employers with stubs and W-2s on the admin Payroll card. Plaid user_good produces one real Plaid-signed SESSION_FINISHED accepted by /api/webhooks/plaid. The Bank card goes Syncing then Done with Statement cells and a transactions count. No CSP violations for Truv Bridge (frame-src https://my.truv.com)."
    why_human: "No vendor keys exist; real signatures and real Bridge/Hosted Link cannot be stubbed"
  - test: "Real-phone connect flows: on a phone (320 px, 200 % text), open the client link, connect payroll in Bridge, connect a bank through Hosted Link in the same tab, and return"
    expected: "/c/return keeps the SameSite=Lax cookie, shows 'Checking your connection…', and toasts 'Bank connected'. All tap targets are at least 44 px."
    why_human: "Device behavior and the cross-site top-level redirect"
  - test: "No-keys manual fallback on the deployed URL: from the payroll sheet and the bank sheet, tap 'Upload … instead' and upload a PDF; in the bank sheet with a connected account, also use a per-month 'Upload your {Mon YYYY} statement'"
    expected: "201 mint, the file reaches ready, the step reads 'With your agent', and the file shows in the staff review panel; a month upload shows as uploaded manually in the client cells and the staff grid"
    why_human: "The server path is proven in-process against the live project (bank-manual-upload.test.ts, 2/2), but the deployed Worker version (recorded as 8822a38, which contains 93a7b52) could not be read without the Cloudflare token, and the UploadSheet is mocked in both sheet suites"
  - test: "Live suites for the three behavior-unverified truths: `pnpm -C app test:live:file` on worker/test/connections-live.test.ts, remove-items.test.ts, payroll-fetch.test.ts and payroll-start.test.ts, serially"
    expected: "All pass"
    why_human: "They write fixtures to the live database; this verifier was limited to one live file"
---

# Phase 4: Connect Payroll & Bank Verification Report

**Phase goal:** As a tax-resolution client, I want to connect my payroll and my bank from the link on my phone, so that my pay stubs, W-2s, and 6 months of bank statements reach my case manager without me hunting for documents.
**Verified:** 2026-10-11T19:10:00Z (re-verification; initial report 2026-10-11T13:40:00Z)
**Status:** human_needed (was gaps_found)
**Re-verification:** Yes, after gap closure. See "Re-verification (2026-10-11)" at the end. The sections between here and there are the initial report, kept as written, so their gap findings for truths 2 and 5 are superseded.
**Judged at (initial):** HEAD `3f46de4`.

## User Flow Coverage (MVP)

| Step | Expected | Evidence in codebase | Status |
|------|----------|----------------------|--------|
| Client opens the connect payroll step | Payroll sheet, consent, Truv Bridge | `step-list.tsx:141` → `PayrollStep`; `useConnectFlow` → `/api/c/consents` → `/connections/payroll/start` → `TruvBridge.init({ isOrder: true })` | Present (no keys, so it is not live) |
| Client cannot connect payroll, so uploads stubs and W-2s | Upload works in the same step | `payroll-step.tsx:82` opens UploadSheet on the `payroll_connect` item, and `c-uploads.ts:72` answers 409 `item_not_upload` | **FAILED** (closed in re-verification) |
| Client connects the bank | Consent, then Hosted Link with a fresh token per tap | `bank/start.ts` creates a new link token and nonce on every tap; `link.ts` sets `days_requested: 365` and `required_if_supported_products: ['statements']` | Verified (unit) |
| Client returns from Plaid | `/c/return` reconciles only | `c-return.ts` uses a single-use nonce, enqueues a reconcile, and redirects with 302; the 500 fix `027f455` is at HEAD but not deployed | Verified at HEAD |
| Client uploads a missing month or statements | Manual upload marked per month | `bank-step.tsx:75` opens UploadSheet on the `bank_connect` item, which gets the same 409 | **FAILED** (closed in re-verification) |
| Staff see the data | Cards, 3/6-month grid, transactions, employer documents, Refresh | `request-page.tsx:183` mounts `ConnectionsPanel`; the admin routes are firm-scoped | Verified (unit) |

Outcome clause ("reach my case manager without me hunting for documents"): with vendor keys, the connect paths are built and wired. Without keys, which is the current deploy and the README's documented demo fallback, **no document can reach the case from either connect step**, because both fallbacks die at the upload mint. (Initial finding; closed by `93a7b52`.)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1a: payroll connect through a Truv order with more than one employer, files attributed per employer, status in the client step and the admin card (PAY-01, PAY-02, PAY-04) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `truv/start.ts` inserts the row before the order and reuses the open order; `payroll-reconcile.ts` fetches files for each completed employer into `<slug>-<employer_id>`; `mapOrderStatus` is unit-tested (orders.test passes). The fetch-to-Storage path is proven only by stubbed live tests, and real Truv needs keys. |
| 2 | SC1b / PAY-03: manual pay stub and W-2 upload in the same step | ✗ FAILED (initial) → ✓ VERIFIED (re-verification) | Initial: `c-uploads.ts:72` refused non-`upload` items. See re-verification. |
| 3 | SC2 / BANK-05, BANK-01: consent screen accepted and logged before Plaid; Hosted Link from the portal; fresh link token per tap | ✓ VERIFIED | `c-connections.ts` returns 409 `consent_required` before any vendor call, writes `recordConsent` and `consent.<kind>` once per version, and returns 409 `consent_text_stale`; `startBank` mints a new token and nonce per tap; c-connections.test, link.test and bank-step.test pass |
| 4 | SC3a / BANK-02, BANK-03: transactions plus monthly statement PDFs in the case; last 3 and full 6 visible; per-month status | ✓ VERIFIED | `bank-reconcile.ts` (sync cursor loop, vault, done only when history is complete and 0 cells are pending); `bank-statements.ts` (hash-checked download, month cells); `connections-ops.ts` read model; `statement-grid.tsx` with the Last 3 / Months 4-6 split; `transactions-table.tsx` with a 3/6 toggle; unit tests pass. The end-to-end Plaid data run is a rehearsal item. |
| 5 | SC3b / BANK-03: manual statement upload as a first-class fallback, shown as "uploaded manually" | ✗ FAILED (initial) → ✓ VERIFIED (re-verification) | Initial: same 409 at `c-uploads.ts:72`. See re-verification. |
| 6 | SC4a / WEBH-01: raw-body signature check, one ledger row per event, ack under 1 s, queue retries and DLQ | ✓ VERIFIED | `webhooks.ts` calls `c.req.text()` once, then verify, `recordWebhook` (upsert ignoreDuplicates), enqueues an id only, and returns 200; Truv uses `v1=` HMAC with `timingSafeEqual`; Plaid checks ES256 only, `maxTokenAge 5 min`, and the raw-body SHA-256; `jobs/index.ts` uses a `min(60·2^n, 86400)` backoff and the DLQ branch; `wrangler.jsonc` sets `max_retries 5` and the DLQ. webhooks, plaid, truv and jobs/index tests pass. |
| 7 | SC4b / WEBH-03: transitions are monotonic | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `0005_connections.sql`: `status_rank` plus `connection_set_status` lock request → connection → item `FOR UPDATE`; a lower rank is ignored unless it repairs an `error`; the item only moves forward. The live rank-matrix suite was not run (it writes to the live DB). |
| 8 | SC4c / WEBH-02: a cron reconciler and a staff Refresh re-read provider state | ✓ VERIFIED | `cron.ts` reconcileTick (stuck `queued` events, stale connections, `link_expired`) and dailyJobs; `wrangler.jsonc` crons `*/15 * * * *` and `0 3 * * *`; `admin-connections.ts` Refresh runs `reconcileConnection` inline; cron.test and admin-connections.test pass |
| 9 | SC5a / BANK-04: `BankProvider` interface with declared capabilities, and the provider comes from configuration | ✓ VERIFIED | `bank/provider.ts` (interface, 7 operations, `PROVIDER_CAPABILITIES` for plaid and teller); `bankProvider(env, id)` reads `BANK_PROVIDER`; the routes and UI branch on `capabilities` (bank-step: `hostedLink`, `statementPdfs`) |
| 10 | SC5b / BANK-06: Plaid Items removed after the configured window (default 30 days) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `remove_after` = now + `PLAID_REMOVE_AFTER_DAYS` at connect; `listRemovalCandidates` (`remove_after <= now`, secret present); `removeItem` deletes the secret and sets `removed`. Dispatch and routing are unit-tested; removeItem itself only in the live suite. |

**Score (initial):** 5/10. **Score (re-verification):** 7/10 truths verified (3 present but behavior-unverified, 0 failed).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/0005_connections.sql` | 7 tables, 3 functions, RLS | ✓ VERIFIED | `db-migrate.mjs --status` lists `0005_connections` as applied |
| `app/worker/src/routes/webhooks.ts` + `webhooks/{truv,plaid,adapters}.ts` | Generic verified webhook route | ✓ VERIFIED | Mounted at `/api/webhooks` |
| `app/worker/src/jobs/{index,reconcile,payroll-reconcile,bank-reconcile,bank-statements,remove-items}.ts` | Consumer and reconcilers | ✓ VERIFIED | `index.ts` exports `queue` and `scheduled` |
| `app/worker/src/cron.ts` | 15-minute and daily steps | ✓ VERIFIED | Wired through `scheduled` |
| `app/worker/src/routes/{c-connections,c-return,admin-connections}.ts` | Client and staff routes | ✓ VERIFIED | `c-return` is mounted before `clientLinkRoute` |
| `app/worker/src/integrations/{token-vault,bank/*,truv/*}.ts` | Vault and vendor clients | ✓ VERIFIED | Plain `fetch`, AES-GCM with AAD = connection id |
| `app/src/features/client-portal/connect/*` | Consent, payroll, bank and return UI | ⚠️ PARTIAL (initial) → ✓ VERIFIED | The upload fallback is no longer refused server-side |
| `app/src/features/review/connections/*` | Staff cards, grid, transactions, payroll panel | ✓ VERIFIED | Mounted in `request-page.tsx:183` |
| `app/scripts/smoke-connect.mjs`, `docs/app/runbooks/*` | Smoke and runbooks | ✓ VERIFIED (exists) | Post-deploy `smoke:connect` reported passing by the orchestrator |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `payroll-step.tsx` / `bank-step.tsx` upload button | `POST /api/c/items/:itemId/uploads` | `UploadSheet` → `mintUpload(step.id)` | ✗ NOT_WIRED (initial) → ✓ WIRED | `UPLOAD_KINDS` now includes both connect kinds |
| `bank-step.tsx` month upload | `/connections/:id/statements/manual` | `attribute()` after the upload closes | ✗ Unreachable (initial) → ✓ WIRED | Proven live by `bank-manual-upload.test.ts` |
| webhook route | queue consumer | `JOBS.send({type:'webhook', ref})` | ✓ WIRED | |
| consumer, cron, Refresh, client return | `reconcileConnection` → `connection_set_status` | one dispatcher | ✓ WIRED | |
| `bank-step.tsx` connect | Plaid Hosted Link | `window.location.assign(hosted_link_url)` | ✓ WIRED | |
| `/c/return` | reconcile job | single-use nonce | ✓ WIRED | |
| staff `ConnectionsPanel` | `/api/admin/requests/:id/connections`, `/refresh`, `/transactions` | `features/review/connections/api.ts` | ✓ WIRED | Signature connections are filtered out (`.in('kind', ['bank','payroll'])`) |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| Statement grid | `accounts[].months[]` | `bank_statement_months` via `connections-ops` | Yes (DB) | ✓ FLOWING (with keys) |
| Transactions table | rows and total | `bank_transactions` via `listConnectionTransactions` | Yes (DB) | ✓ FLOWING (with keys) |
| Payroll panel | employers and documents | `connections.data.employers` + `documents` by storage group | Yes (DB) | ✓ FLOWING (with keys) |
| Manual fallback documents | `documents` on the connect item | client upload | No (initial) → Yes | ✗ DISCONNECTED (initial) → ✓ FLOWING (`listItemsWithDocuments` in `db/review.ts` has no kind filter) |

### Behavioral Spot-Checks (initial)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase 4 unit and component suites | `pnpm -C app exec vitest run` over 39 Phase 4 files | 39 files, 364 tests passed | ✓ PASS |
| Upload on a connect item is refused | `c-uploads.test.ts` case "not an upload item" | Pinned the gap | ✗ FAIL (for PAY-03 / BANK-03) |
| Migrations applied | `node app/scripts/db-migrate.mjs --status` | 0002 to 0009 applied, including 0005 | ✓ PASS |
| Live suites | not run | They write fixtures to the live DB | ? SKIP → human |

### Probe Execution

Step 7c: no `scripts/*/tests/probe-*.sh` exists and no plan declares one. The phase's runnable checks are `smoke` and `smoke:connect`.

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|-------------|-------------|--------|----------|
| WEBH-01 | 04-01, 04-07 | ✓ SATISFIED (Plaid and Truv; DocuSeal belongs to Phase 6) | Truth 6 |
| WEBH-02 | 04-02, 04-04, 04-06, 04-07 | ✓ SATISFIED | Truth 8 |
| WEBH-03 | 04-01 | ? NEEDS HUMAN (live suite) | Truth 7 |
| PAY-01 | 04-03, 04-05, 04-07 | ? NEEDS HUMAN (sandbox) | Truth 1 |
| PAY-02 | 04-03, 04-06 | ? NEEDS HUMAN (sandbox) | Truth 1 |
| PAY-03 | 04-03, 04-05 | ✗ BLOCKED (initial) → ✓ SATISFIED | Truth 2 |
| PAY-04 | 04-01 to 04-07 | ✓ SATISFIED (mapping and UI unit-tested) | Truth 1 status half |
| BANK-01 | 04-04, 04-05, 04-07 | ✓ SATISFIED (code); real Hosted Link → rehearsal | Truth 3 |
| BANK-02 | 04-04, 04-06 | ✓ SATISFIED (code); real data → rehearsal | Truth 4 |
| BANK-03 | 04-02, 04-04, 04-05, 04-06 | ✗ BLOCKED (initial) → ✓ SATISFIED | Truths 4 and 5 |
| BANK-04 | 04-01, 04-04, 04-05 | ✓ SATISFIED | Truth 9 |
| BANK-05 | 04-03, 04-05, 04-07 | ✓ SATISFIED | Truth 3 |
| BANK-06 | 04-02, 04-04 | ? NEEDS HUMAN (live suite) | Truth 10 |

No orphaned requirement IDs.

### Anti-Patterns Found (initial)

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `app/worker/src/routes/c-uploads.ts` | 72 | Phase 3 guard never widened for the Phase 4 connect fallbacks | 🛑 Blocker (closed) | PAY-03 and BANK-03 fallbacks were dead |
| `app/src/features/client-portal/connect/{payroll,bank}-step.test.tsx` | 25-30 | `vi.mock('@/features/uploads/upload-sheet')` | ⚠️ Warning (mitigated) | Server half now covered unmocked by `bank-manual-upload.test.ts` |
| `docs/app/README.md` | ~139 | "Without keys ... Uploaded files land in the review panel" | ⚠️ Warning (closed) | True once the guard accepts connect kinds |
| `app/src/features/client-portal/connect/payroll-step.tsx` | 108-112 | At `done` there is no connect action | ⚠️ Warning (closed by `533c246`) | |
| `app/worker/src/jobs/bank-statements.ts` + `plaid/statements.ts` | 72 / 25 | A staff Refresh on a zero-statement account calls `/statements/refresh` twice | ℹ️ Info (not re-checked) | Extra billed refresh call |
| four Phase 4 test files | n/a | No companion doc in `docs/` | ℹ️ Info (closed by `14a72af`) | |

### Gaps Summary (initial)

One root cause produced two failed truths: `c-uploads.ts:72` accepted only `upload` items, so the payroll and bank sheets' manual fallbacks (pointed at the connect item itself) got 409 `item_not_upload`. Closed by `93a7b52`; see below.

_Verified (initial): 2026-10-11T13:40:00Z, Claude (gsd-verifier)_

---

## Gap closure (2026-10-11)

Recorded by the executor (claims, judged in the re-verification below).

| # | Gap or warning | Fix | Commit |
|---|----------------|-----|--------|
| 1 | PAY-03 / BANK-03: uploads on connect items refused with 409 `item_not_upload` | `c-uploads.ts`: the mint guard accepts `UPLOAD_KINDS = ['upload', 'bank_connect', 'payroll_connect']`. `address`, `signature`, `intake` and any other kind still get 409 `item_not_upload`. | `93a7b52` |
| 2 | Warning: no "Add another employer" once payroll is `done` | `payroll-step.tsx`: every non-fresh status (including `done`) offers `Add another employer`. `startPayroll` reuses only a `pending`/`connected` order, so a tap at `done` opens a new order on the same item. | `533c246` |
| 3 | Warning: README "Uploaded files land in the review panel" | No edit needed once fix 1 lands. | n/a |
| 4 | Info: missing companion docs | Added docs for `truv/orders.test`, `jobs/index.test`, `webhooks/plaid.test`, `webhooks/truv.test`. | `14a72af` |

_Gap closure: 2026-10-11, Claude (gsd-executor)_

---

## Re-verification (2026-10-11)

**Judged at:** HEAD `4496af5`. `git status --short` is empty for `app/`, `supabase/` and `docs/`, so the judged code is committed code. `93a7b52` and `533c246` are ancestors of `8822a38`, the commit 06-08-SUMMARY records as the current deploy. Since `8822a38`, the only change under the Phase 4 source paths is `app/worker/src/routes/admin-financials.ts` (Phase 7, +18 lines).

### Gaps

| Gap | Evidence at HEAD | Result |
|-----|------------------|--------|
| Truth 2, SC1b / PAY-03 | `c-uploads.ts:31` declares `UPLOAD_KINDS = ['upload', 'bank_connect', 'payroll_connect']`, and `:74` is the only kind guard on the client upload routes. The `/complete`, `/token` and `/items/:itemId/documents` routes have no kind check, and neither has `0004` (`grep kind` finds nothing there). `c-uploads.test.ts:136` runs `it.each(['bank_connect','payroll_connect'])` → 201. `:144-146` keeps `address`, `signature` and `intake` at 409. `payroll-step.tsx` opens `UploadSheet` with `step.id` both as the primary action (rejected step) and as the secondary one. | ✓ VERIFIED. The payroll item goes through the same guard and RPC as the bank item, which is proven live (below). |
| Truth 5, SC3b / BANK-03 | `bank-manual-upload.test.ts` (unmocked: the in-process Worker `app` against the live Supabase project and Storage) mints on a `bank_connect` item, PUTs a PDF to Storage, completes it (`ready` / `submitted`), then `POST /api/c/connections/:id/statements/manual` → 200 `{status:'manual'}`, and the `bank_statement_months` row reads `{status:'manual', document_id}`. The client half (`attribute()` picks only new `ready` documents and swallows `month_available`) is covered by `bank-step.test.tsx:179-224`. `statement-cells.tsx:25` and `statement-grid.tsx:10-14` render `manual`. Staff see the document because `listItemsWithDocuments` (`db/review.ts:83`) has no kind filter. | ✓ VERIFIED |

### Warnings

| Warning | Result |
|---------|--------|
| Sheet suites mock `UploadSheet` | Mitigated. The server half that the mock hid is now proven unmocked. The browser UploadSheet → connect item path on the deployed site stays a human item (#3). |
| README no-keys statement | Closed by the gap fix. |
| No connect action at payroll `done` | Closed. `payroll-step.tsx` labels every non-fresh status `T.another`. `truv/start.ts:40` reuses only `pending`/`connected` orders, so `done` starts a new order. `payroll-step.test.tsx:159` asserts the 44 px button. |
| Companion docs | Closed. The docs for `bank-manual-upload.test.ts`, `c-uploads` and `uploads/api` describe the new `UPLOAD_KINDS`. |

### Behavior-unverified truths (1, 7, 10)

These are unchanged. I was allowed one live file and used it on `bank-manual-upload.test.ts`, the file that proves the closed gaps. `connections-live`, `remove-items`, `payroll-fetch` and `payroll-start` were not run. 06-08-SUMMARY claims a green serial `test:live` (42 files, 417 tests), which would include them. That is a summary claim that I did not reproduce, so these three stay ⚠️ PRESENT_BEHAVIOR_UNVERIFIED and are listed under human verification. If the orchestrator accepts that run as evidence, it can add overrides for truths 7 and 10. Truth 1 also needs real Truv keys.

### Spot-checks (re-verification)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase 4 unit and component regression | `pnpm -C app exec vitest run` over connect UI, review/connections UI, statement-months, cron, connections-ops, bank/*, token-vault, truv/*, jobs/{index,payroll-reconcile,reconcile}, routes/{admin-connections,c-connections,c-return,c-uploads,webhooks}, webhooks/{plaid,truv}, client-csp, connection-files | 36 files, 335 tests passed | ✓ PASS |
| Manual statement upload on a `bank_connect` item, live and unmocked | `pnpm -C app run test:live:file worker/test/bank-manual-upload.test.ts` | 1 file, 2 tests passed (not skipped); the suite cleans up its own documents, objects, connection and request | ✓ PASS |
| Deployed plain smoke | `node app/scripts/smoke.mjs https://resspark.zh-a16.workers.dev` | 14 ok, 0 FAIL (includes `webhooks truv 401`, `webhooks unknown 404`, `admin connections 401`) | ✓ PASS |
| Deployed `smoke:connect` | not run by me | Reported passing by the orchestrator (return csp ok, admin connections 0, keys no/no) | reported |

The initial run covered 39 files and 364 tests. Today's narrower selection left out the `logics-push*` job tests and `docuseal`, which belong to other phases.

### Anti-patterns (re-verification, changed files)

`c-uploads.ts` (171 lines), `c-uploads.test.ts` (271), `payroll-step.tsx` (189), `payroll-step.test.tsx` (236) and `bank-manual-upload.test.ts` (108) are all under 500 lines. None contains a `TBD`, `FIXME`, `XXX`, `TODO` or `HACK` marker.

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `worker/src/db/connections.ts:93` (`latestConnectionForItem`) used by `GET /api/c/items/:itemId/connection` | Once "Add another employer" opens a second order at `done`, the client sheet shows only the newest connection. The first employer drops out of the client view, and an abandoned second order leaves the sheet at "Finishing up…". | ℹ️ Info | Staff data is unaffected, because the admin panel lists every bank/payroll connection on the request. Cosmetic for the client. |

### Advisory (new scope, unevidenced)

None.

### Human Verification Required

1. **Sandbox rehearsal with keys** (truth 1; `docs/app/runbooks/plaid-sandbox-rehearsal.md`)
   - **Test:** Run `secrets:provider plaid|truv` with Sandbox keys, register the Plaid redirect URI and the Truv webhook, then run the README Phase 4 demo.
   - **Expected:** Two Truv employers with stubs and W-2s on the Payroll card. One real Plaid-signed `SESSION_FINISHED` is accepted. The Bank card goes Syncing then Done with Statement cells. No Truv Bridge CSP violations.
   - **Why human:** No vendor keys exist.
2. **Real-phone connect flows**
   - **Test:** On a 320 px phone at 200 % text, run Bridge and Hosted Link in the same tab, then return.
   - **Expected:** The cookie survives `/c/return`. The screen shows "Checking your connection…" and then a "Bank connected" toast. Tap targets are at least 44 px.
   - **Why human:** Device behavior and the cross-site redirect.
3. **No-keys manual fallback on the deployed URL**
   - **Test:** Tap "Upload … instead" in the payroll and bank sheets and upload a PDF.
   - **Expected:** The file reaches `ready`, the step reads "With your agent", and the file appears in the staff review panel.
   - **Why human:** The deployed version id could not be read without the Cloudflare token, and the sheet suites mock UploadSheet. The server path itself is proven.
4. **Live suites for truths 7, 10 and 1**
   - **Test:** Run `test:live:file` serially on `connections-live`, `remove-items`, `payroll-fetch` and `payroll-start`.
   - **Expected:** All pass.
   - **Why human:** They write to the live database, and this verifier was limited to one live file.

### Status

`human_needed`, 7/10. No gaps remain. The two blockers are closed in committed code and proven by unit tests plus one unmocked live test. Three truths are still present but behavior-unverified, and they need the live suites or vendor keys.

_Re-verified: 2026-10-11T19:10:00Z_
_Verifier: Claude (gsd-verifier)_
