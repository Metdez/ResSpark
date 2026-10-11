---
phase: 04-connect-payroll-bank
verified: 2026-10-11T13:40:00Z
status: gaps_found
score: 5/10 must-haves verified
covered_files: [".planning/phases/04-connect-payroll-bank/04-01-PLAN.md", ".planning/phases/04-connect-payroll-bank/04-01-SUMMARY.md", ".planning/phases/04-connect-payroll-bank/04-02-PLAN.md", ".planning/phases/04-connect-payroll-bank/04-02-SUMMARY.md", ".planning/phases/04-connect-payroll-bank/04-03-PLAN.md", ".planning/phases/04-connect-payroll-bank/04-03-SUMMARY.md", ".planning/phases/04-connect-payroll-bank/04-04-PLAN.md", ".planning/phases/04-connect-payroll-bank/04-04-SUMMARY.md", ".planning/phases/04-connect-payroll-bank/04-05-PLAN.md", ".planning/phases/04-connect-payroll-bank/04-05-SUMMARY.md", ".planning/phases/04-connect-payroll-bank/04-06-PLAN.md", ".planning/phases/04-connect-payroll-bank/04-06-SUMMARY.md", ".planning/phases/04-connect-payroll-bank/04-07-PLAN.md", ".planning/phases/04-connect-payroll-bank/04-07-SUMMARY.md", "app/src/features/client-portal/connect/bank-step.tsx", "app/src/features/client-portal/connect/payroll-step.tsx", "app/worker/src/cron.ts", "app/worker/src/integrations/bank/provider.ts", "app/worker/src/integrations/bank/start.ts", "app/worker/src/integrations/truv/orders.ts", "app/worker/src/integrations/truv/start.ts", "app/worker/src/jobs/bank-reconcile.ts", "app/worker/src/jobs/bank-statements.ts", "app/worker/src/jobs/index.ts", "app/worker/src/jobs/payroll-reconcile.ts", "app/worker/src/jobs/reconcile.ts", "app/worker/src/jobs/remove-items.ts", "app/worker/src/routes/admin-connections.ts", "app/worker/src/routes/c-connections.ts", "app/worker/src/routes/c-return.ts", "app/worker/src/routes/c-uploads.ts", "app/worker/src/routes/webhooks.ts", "app/worker/src/webhooks/plaid.ts", "app/worker/src/webhooks/truv.ts", "supabase/migrations/0005_connections.sql"]
covered_digest: "v3:sha256:07ebad1e600a43d5fad72e9bda5e35f69c35f91ee7134de58f4d8d516cc1fd7d"
behavior_unverified: 3
overrides_applied: 0
gaps:
  - truth: "A client who cannot find their employer uploads pay stubs and W-2s manually in the same step (SC1 / PAY-03)"
    status: failed
    reason: "The payroll sheet opens Phase 3's UploadSheet for the payroll_connect item (step.id), but the Worker's mint route refuses every item whose kind is not 'upload' with 409 item_not_upload. The fallback button is rendered and wired, but the first server call fails. The sheet tests mock UploadSheet, so no test covers the real request. This is also the only payroll path in no-keys mode, which is the current deploy."
    artifacts:
      - path: "app/worker/src/routes/c-uploads.ts"
        issue: "Line 72: `if (item.kind !== 'upload') return fail(c, 409, 'item_not_upload', ...)` rejects payroll_connect and bank_connect items"
      - path: "app/worker/src/routes/c-uploads.test.ts"
        issue: "Line 137 asserts that a bank_connect item gets 409 item_not_upload, so the test pins the broken behavior"
      - path: "app/src/features/client-portal/connect/payroll-step.tsx"
        issue: "Lines 80-90: UploadSheet item id = step.id (the payroll_connect item)"
    missing:
      - "c-uploads.ts:72: also accept the connect kinds, e.g. `if (!['upload', 'bank_connect', 'payroll_connect'].includes(item.kind))`. The 0004 RPCs have no kind check, so this one guard is the whole fix."
      - "c-uploads.test.ts:137: change the item_not_upload case to a kind that must still be refused ('address' or 'signature'), and add 201 cases for bank_connect and payroll_connect"
      - "Update docs/app/worker/src/routes/c-uploads.md, docs/app/worker/src/routes/c-uploads.test.md and docs/app/src/features/uploads/api.md (the item_not_upload wording)"
  - truth: "Each connected account offers manual statement upload as a first-class fallback, and manual uploads show as 'uploaded manually' per month (SC3 / BANK-03)"
    status: failed
    reason: "Same root cause. The bank sheet's 'Upload statements instead' button and the per-month 'Upload your {Mon YYYY} statement' buttons both open UploadSheet for the bank_connect item, and the mint route answers 409 item_not_upload. No document is ever created, so /connections/:id/statements/manual (which requires a ready document on the same item) can never set a cell to 'manual'. bank-step.test.tsx mocks UploadSheet."
    artifacts:
      - path: "app/worker/src/routes/c-uploads.ts"
        issue: "Line 72 refuses bank_connect items"
      - path: "app/src/features/client-portal/connect/bank-step.tsx"
        issue: "Lines 75-90: UploadSheet item id = step.id (the bank_connect item); the attribution in lines 61-73 depends on that upload"
    missing:
      - "Fixed by the same c-uploads.ts:72 change as the PAY-03 gap"
      - "Add one unmocked check: a worker test that mints and completes an upload on a bank_connect item, then attributes it through POST /connections/:id/statements/manual and reads the cell as 'manual'"
behavior_unverified_items:
  - truth: "SC1: a client connects payroll through a Truv order with more than one employer; staff see the income report, pay stubs and W-2s per employer; status shows in the client step and the admin card"
    test: "With Truv Sandbox keys, run the rehearsal runbook: Connect payroll, consent, Bridge with multiple.employments / goodpassword, then open the admin request page"
    expected: "The Payroll card reads Done and lists two employers with their pay stub, W-2 and income report links. The client sheet shows both employers with Done chips. The documents also appear under the item in the review panel."
    why_human: "No Truv keys exist. Order creation, report and document fetch, and Storage writes are covered only by stubbed live tests (payroll-start, payroll-fetch), which were not re-run here because they write to the live database"
  - truth: "SC4 / WEBH-03: connection_set_status is monotonic (done never goes back to pending, error is repairable, removed is terminal, concurrent writers converge)"
    test: "Run `pnpm -C app test:live:file worker/test/connections-live.test.ts` serially on a quiet tree"
    expected: "All 17 rank-matrix cases pass, including the concurrent connected/syncing case"
    why_human: "The SQL in 0005_connections.sql implements the rank rule correctly on reading. The only behavioral proof is the live suite, which writes fixtures to the live database, and this verifier may not write to it"
  - truth: "SC5 / BANK-06: Plaid Items older than PLAID_REMOVE_AFTER_DAYS (default 30) are removed, the secret is deleted, and documents, transactions and month cells stay"
    test: "Run `pnpm -C app test:live:file worker/test/remove-items.test.ts`"
    expected: "Removal calls /item/remove, deletes connection_secrets, sets status removed, and keeps the data rows. ITEM_NOT_FOUND counts as already removed."
    why_human: "The cron dispatch (cron.test.ts) and consumer routing (jobs/index.test.ts) pass here. removeItem itself is proven only by the live suite"
---

# Phase 4: Connect Payroll & Bank Verification Report

**Phase goal:** As a tax-resolution client, I want to connect my payroll and my bank from the link on my phone, so that my pay stubs, W-2s, and 6 months of bank statements reach my case manager without me hunting for documents.
**Verified:** 2026-10-11T13:40:00Z
**Status:** gaps_found
**Re-verification:** No. This is the initial verification.
**Judged at:** HEAD `3f46de4`. No Phase 4 file has uncommitted changes (`git status` on `app/worker/src`, `app/src/features/client-portal`, `app/src/features/review/connections`, `app/src/lib`, `supabase` is clean).

## User Flow Coverage (MVP)

| Step | Expected | Evidence in codebase | Status |
|------|----------|----------------------|--------|
| Client opens the connect payroll step | Payroll sheet, consent, Truv Bridge | `step-list.tsx:141` → `PayrollStep`; `useConnectFlow` → `/api/c/consents` → `/connections/payroll/start` → `TruvBridge.init({ isOrder: true })` | Present (no keys, so it is not live) |
| Client cannot connect payroll, so uploads stubs and W-2s | Upload works in the same step | `payroll-step.tsx:82` opens UploadSheet on the `payroll_connect` item, and `c-uploads.ts:72` answers 409 `item_not_upload` | **FAILED** |
| Client connects the bank | Consent, then Hosted Link with a fresh token per tap | `bank/start.ts` creates a new link token and nonce on every tap; `link.ts` sets `days_requested: 365` and `required_if_supported_products: ['statements']` | Verified (unit) |
| Client returns from Plaid | `/c/return` reconciles only | `c-return.ts` uses a single-use nonce, enqueues a reconcile, and redirects with 302; the 500 fix `027f455` is at HEAD but not deployed | Verified at HEAD |
| Client uploads a missing month or statements | Manual upload marked per month | `bank-step.tsx:75` opens UploadSheet on the `bank_connect` item, which gets the same 409 | **FAILED** |
| Staff see the data | Cards, 3/6-month grid, transactions, employer documents, Refresh | `request-page.tsx:183` mounts `ConnectionsPanel`; the admin routes are firm-scoped | Verified (unit) |

Outcome clause ("reach my case manager without me hunting for documents"): with vendor keys, the connect paths are built and wired. Without keys, which is the current deploy and the README's documented demo fallback, **no document can reach the case from either connect step**, because both fallbacks die at the upload mint.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1a: payroll connect through a Truv order with more than one employer, files attributed per employer, status in the client step and the admin card (PAY-01, PAY-02, PAY-04) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `truv/start.ts` inserts the row before the order and reuses the open order; `payroll-reconcile.ts` fetches files for each completed employer into `<slug>-<employer_id>`; `mapOrderStatus` is unit-tested (orders.test passes). The fetch-to-Storage path is proven only by stubbed live tests, and real Truv needs keys. |
| 2 | SC1b / PAY-03: manual pay stub and W-2 upload in the same step | ✗ FAILED | `c-uploads.ts:72` refuses non-`upload` items. `c-uploads.test.ts:137` asserts 409 for `bank_connect`. The payroll and bank sheet tests mock UploadSheet. |
| 3 | SC2 / BANK-05, BANK-01: consent screen accepted and logged before Plaid; Hosted Link from the portal; fresh link token per tap | ✓ VERIFIED | `c-connections.ts` returns 409 `consent_required` before any vendor call, writes `recordConsent` and `consent.<kind>` once per version, and returns 409 `consent_text_stale`; `startBank` mints a new token and nonce per tap; c-connections.test, link.test and bank-step.test pass |
| 4 | SC3a / BANK-02, BANK-03: transactions plus monthly statement PDFs in the case; last 3 and full 6 visible; per-month status | ✓ VERIFIED | `bank-reconcile.ts` (sync cursor loop, vault, done only when history is complete and 0 cells are pending); `bank-statements.ts` (hash-checked download, month cells); `connections-ops.ts` read model; `statement-grid.tsx` with the Last 3 / Months 4-6 split; `transactions-table.tsx` with a 3/6 toggle; unit tests pass. The end-to-end Plaid data run is a rehearsal item. |
| 5 | SC3b / BANK-03: manual statement upload as a first-class fallback, shown as "uploaded manually" | ✗ FAILED | Same 409 at `c-uploads.ts:72`, so the `/statements/manual` attribution never has a document to attribute |
| 6 | SC4a / WEBH-01: raw-body signature check, one ledger row per event, ack under 1 s, queue retries and DLQ | ✓ VERIFIED | `webhooks.ts` calls `c.req.text()` once, then verify, `recordWebhook` (upsert ignoreDuplicates), enqueues an id only, and returns 200; Truv uses `v1=` HMAC with `timingSafeEqual`; Plaid checks ES256 only, `maxTokenAge 5 min`, and the raw-body SHA-256; `jobs/index.ts` uses a `min(60·2^n, 86400)` backoff and the DLQ branch; `wrangler.jsonc` sets `max_retries 5` and the DLQ. webhooks, plaid, truv and jobs/index tests pass. |
| 7 | SC4b / WEBH-03: transitions are monotonic | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `0005_connections.sql`: `status_rank` plus `connection_set_status` lock request → connection → item `FOR UPDATE`; a lower rank is ignored unless it repairs an `error`; the item only moves forward. The live rank-matrix suite was not run (it writes to the live DB). |
| 8 | SC4c / WEBH-02: a cron reconciler and a staff Refresh re-read provider state | ✓ VERIFIED | `cron.ts` reconcileTick (stuck `queued` events, stale connections, `link_expired`) and dailyJobs; `wrangler.jsonc` crons `*/15 * * * *` and `0 3 * * *`; `admin-connections.ts` Refresh runs `reconcileConnection` inline; cron.test and admin-connections.test pass |
| 9 | SC5a / BANK-04: `BankProvider` interface with declared capabilities, and the provider comes from configuration | ✓ VERIFIED | `bank/provider.ts` (interface, 7 operations, `PROVIDER_CAPABILITIES` for plaid and teller); `bankProvider(env, id)` reads `BANK_PROVIDER`; the routes and UI branch on `capabilities` (bank-step: `hostedLink`, `statementPdfs`) |
| 10 | SC5b / BANK-06: Plaid Items removed after the configured window (default 30 days) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `remove_after` = now + `PLAID_REMOVE_AFTER_DAYS` at connect; `listRemovalCandidates` (`remove_after <= now`, secret present); `removeItem` deletes the secret and sets `removed`. Dispatch and routing are unit-tested; removeItem itself only in the live suite. |

**Score:** 5/10 truths verified (3 present but behavior-unverified, 2 failed)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/0005_connections.sql` | 7 tables, 3 functions, RLS | ✓ VERIFIED | `db-migrate.mjs --status` lists `0005_connections` as applied |
| `app/worker/src/routes/webhooks.ts` + `webhooks/{truv,plaid,adapters}.ts` | Generic verified webhook route | ✓ VERIFIED | Mounted at `/api/webhooks` |
| `app/worker/src/jobs/{index,reconcile,payroll-reconcile,bank-reconcile,bank-statements,remove-items}.ts` | Consumer and reconcilers | ✓ VERIFIED | `index.ts` exports `queue` and `scheduled` |
| `app/worker/src/cron.ts` | 15-minute and daily steps | ✓ VERIFIED | Wired through `scheduled` |
| `app/worker/src/routes/{c-connections,c-return,admin-connections}.ts` | Client and staff routes | ✓ VERIFIED | `c-return` is mounted before `clientLinkRoute` |
| `app/worker/src/integrations/{token-vault,bank/*,truv/*}.ts` | Vault and vendor clients | ✓ VERIFIED | Plain `fetch`, AES-GCM with AAD = connection id |
| `app/src/features/client-portal/connect/*` | Consent, payroll, bank and return UI | ⚠️ PARTIAL | Wired into `step-list.tsx`; the upload fallback in both sheets is broken by the server guard |
| `app/src/features/review/connections/*` | Staff cards, grid, transactions, payroll panel | ✓ VERIFIED | Mounted in `request-page.tsx:183` |
| `app/scripts/smoke-connect.mjs`, `docs/app/runbooks/*` | Smoke and runbooks | ✓ VERIFIED (exists) | The post-deploy run is pending |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `payroll-step.tsx` / `bank-step.tsx` upload button | `POST /api/c/items/:itemId/uploads` | `UploadSheet` → `mintUpload(step.id)` | ✗ NOT_WIRED (server refuses) | 409 `item_not_upload` for connect kinds |
| `bank-step.tsx` month upload | `/connections/:id/statements/manual` | `attribute()` after the upload closes | ✗ Unreachable | No ready document on the item |
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
| Manual fallback documents | `documents` on the connect item | client upload | No: the mint is refused | ✗ DISCONNECTED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase 4 unit and component suites | `pnpm -C app exec vitest run` over 39 Phase 4 files (webhooks, jobs, cron, admin-connections, connections-ops, c-connections, c-return, client-csp, truv, bank, token-vault, connection-files, connect UI, review/connections UI, statement-months, c-uploads) | 39 files, 364 tests passed | ✓ PASS |
| Upload on a connect item is refused | `c-uploads.test.ts` case "not an upload item" (`bank_connect` → 409 `item_not_upload`), passing in the run above | Pins the gap | ✗ FAIL (for PAY-03 / BANK-03) |
| Migrations applied | `node app/scripts/db-migrate.mjs --status` | 0002 to 0009 applied, including 0005 | ✓ PASS |
| Live suites (rank matrix, payroll fetch, bank complete and statements, remove-items) | not run | They write fixtures to the live DB, which is forbidden for this verifier | ? SKIP → human |

### Probe Execution

Step 7c: no `scripts/*/tests/probe-*.sh` exists and no plan declares one. The phase's runnable check is `smoke:connect`. It was not run because the deployed Worker is behind HEAD (the `/c/return` 500 fix `027f455` is not deployed). It is listed as a post-deploy human item.

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|-------------|-------------|--------|----------|
| WEBH-01 | 04-01, 04-07 | ✓ SATISFIED (Plaid and Truv; DocuSeal belongs to Phase 6) | Truth 6 |
| WEBH-02 | 04-02, 04-04, 04-06, 04-07 | ✓ SATISFIED | Truth 8 |
| WEBH-03 | 04-01 | ? NEEDS HUMAN (live suite) | Truth 7 |
| PAY-01 | 04-03, 04-05, 04-07 | ? NEEDS HUMAN (sandbox) | Truth 1 |
| PAY-02 | 04-03, 04-06 | ? NEEDS HUMAN (sandbox) | Truth 1 |
| PAY-03 | 04-03, 04-05 | ✗ BLOCKED | Truth 2 |
| PAY-04 | 04-01 to 04-07 | ✓ SATISFIED (mapping and UI unit-tested) | Truth 1 status half |
| BANK-01 | 04-04, 04-05, 04-07 | ✓ SATISFIED (code); real Hosted Link → rehearsal | Truth 3 |
| BANK-02 | 04-04, 04-06 | ✓ SATISFIED (code); real data → rehearsal | Truth 4 |
| BANK-03 | 04-02, 04-04, 04-05, 04-06 | ✗ BLOCKED (manual fallback half) | Truths 4 and 5 |
| BANK-04 | 04-01, 04-04, 04-05 | ✓ SATISFIED | Truth 9 |
| BANK-05 | 04-03, 04-05, 04-07 | ✓ SATISFIED | Truth 3 |
| BANK-06 | 04-02, 04-04 | ? NEEDS HUMAN (live suite) | Truth 10 |

REQUIREMENTS.md marks all 13 as `[x] Complete`. PAY-03 and BANK-03 are not complete at HEAD. No orphaned requirement IDs.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `app/worker/src/routes/c-uploads.ts` | 72 | Phase 3 guard never widened for the Phase 4 connect fallbacks | 🛑 Blocker | PAY-03 and BANK-03 fallbacks are dead, and so is the whole no-keys demo path |
| `app/src/features/client-portal/connect/{payroll,bank}-step.test.tsx` | 25-30 | `vi.mock('@/features/uploads/upload-sheet')` | ⚠️ Warning | Hid the blocker: the tests only check that the sheet opens with `step.id` |
| `docs/app/README.md` | ~139 | "Without keys ... Uploaded files land in the review panel" | ⚠️ Warning | False until the gap is fixed. The demo would hit "This step does not take files." |
| `app/src/features/client-portal/connect/payroll-step.tsx` | 108-112 | At `done` there is no connect action | ⚠️ Warning | After one employer completes and the Bridge session closes, a client with a second job at a different payroll provider has no in-portal path except the (broken) upload. The `multiple.employments` demo login is unaffected. The server already supports it: `startPayroll` creates a new order when the latest one is `done`. |
| `app/worker/src/jobs/bank-statements.ts` + `plaid/statements.ts` | 72 / 25 | A staff Refresh on a zero-statement account calls `/statements/refresh` twice (once in `listStatements`, once in the loop) | ℹ️ Info | Extra billed refresh call; correctness is unaffected |
| `app/worker/src/integrations/truv/orders.test.ts`, `jobs/index.test.ts`, `webhooks/plaid.test.ts`, `webhooks/truv.test.ts` | n/a | No companion doc in `docs/` | ℹ️ Info | CLAUDE.md companion-doc rule |

No `TBD`, `FIXME`, `XXX`, `TODO` or `HACK` markers appear in `app/worker/src` or `app/src/features`. No Phase 4 code file is over 500 lines.

### Human Verification Required

These are run after the gaps are closed.

1. **Sandbox rehearsal with keys** (`docs/app/runbooks/plaid-sandbox-rehearsal.md`, currently `blocked-pending-user: no vendor keys`)
   - **Test:** Run `secrets:provider plaid|truv` with Sandbox keys, register the Plaid redirect URI and the Truv webhook, then run the README's Phase 4 demo script.
   - **Expected:** Truv `multiple.employments` gives two employers with stubs and W-2s on the admin Payroll card. Plaid `user_good` produces one real Plaid-signed `SESSION_FINISHED` accepted by `/api/webhooks/plaid`. The Bank card goes Syncing then Done, with `Statement` cells and a transactions count. No CSP violations appear in the console for Truv Bridge (`frame-src https://my.truv.com` is unconfirmed).
   - **Why human:** No vendor keys exist, and real signatures and real Bridge/Hosted Link cannot be stubbed.
2. **Real-phone connect flows**
   - **Test:** On a phone (320 px, 200 % text), open the client link, connect payroll in Bridge, connect a bank through Hosted Link in the same tab, and return.
   - **Expected:** `/c/return` keeps the SameSite=Lax cookie, shows `Checking your connection…`, and toasts `Bank connected`. All tap targets are at least 44 px.
   - **Why human:** Device behavior and the cross-site top-level redirect.
3. **Post-deploy `smoke:connect`**
   - **Test:** Deploy HEAD, then run `pnpm -C app smoke:connect https://resspark.zh-a16.workers.dev`.
   - **Expected:** `ok connect-flow return csp`, `ok connect-flow admin connections 0`, `ok connect-flow complete (keys: payroll no, bank no)`, plus the plain smoke's `webhooks truv 401`, `webhooks unknown 404`, and `admin connections 401`.
   - **Why human:** The deployed Worker is behind HEAD; this verifier may not deploy.
4. **No-keys manual fallback on the deployed URL (after the gap fix)**
   - **Test:** From the payroll and bank sheets, tap `Upload … instead` and upload a PDF.
   - **Expected:** 201 mint, the file reaches `ready`, the step becomes `With your agent`, and the file shows in the staff review panel.
   - **Why human:** This is the demo path. It needs a real cookie session and a Storage write.
5. **Live suites** (behavior-unverified truths 1, 7 and 10)
   - **Test:** Serially, after 06-06's work is committed: `pnpm -C app test:live -- --no-file-parallelism --test-timeout=30000`, focusing on `connections-live`, `remove-items`, `payroll-fetch`, `payroll-start`, `bank-complete`, and `bank-statements`.
   - **Expected:** All pass. 04-07 reported 385/388, with the 3 failures in 06-06's `client-link.test.ts`. The 04-07 Nyquist gate ("`test:live` green on the final tree") was not met on the shared tree.
   - **Why human:** These write fixtures to the live database.

### Gaps Summary

One root cause produces two failed truths. Phase 3's upload mint route (`app/worker/src/routes/c-uploads.ts:72`) only accepts `upload` items. Phase 4 reused Phase 3's `UploadSheet` as the "one upload path" fallback inside the payroll and bank connect sheets (D-07, D-10), pointed at the connect item itself, but never widened that guard. As a result:

- **PAY-03 / SC1:** "Upload pay stubs instead" fails with "This step does not take files."
- **BANK-03 / SC3:** "Upload statements instead" and every per-month "Upload your {Mon YYYY} statement" fail the same way, so no month can ever become `manual`.

Neither fails in tests because both sheet suites mock `UploadSheet`, and Phase 3's own test asserts the refusal. The current deploy and the README's "without keys" demo both rely on exactly this fallback, so today a client cannot get any payroll or bank document into the case from those two steps.

**Smallest fix:**
1. In `c-uploads.ts:72`, accept `upload | bank_connect | payroll_connect`.
2. Update `c-uploads.test.ts:137` to refuse `address` or `signature` instead, and add 201 cases for the two connect kinds.
3. Add one unmocked worker test that mints, completes, and attributes a statement month on a `bank_connect` item.
4. Update the three docs that name `item_not_upload`.

No later phase (5 to 8) covers this, so it is not deferred.

---

_Verified: 2026-10-11T13:40:00Z_
_Verifier: Claude (gsd-verifier)_
