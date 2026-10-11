---
phase: 04-connect-payroll-bank
plan: 01
subsystem: api
tags: [webhooks, cloudflare-queues, supabase, postgres, truv, plaid, jose, hmac, es256]

requires:
  - phase: 03-uploads-review-live-status
    provides: "request_apply_status(), documents table, test firm ...000e and case ...0000e1, explicit service_role grant pattern"
  - phase: 01-foundation-staff-sign-in
    provides: "JOBS queue binding, queue export placeholder, logEvent, allowlisted logger, db-migrate.mjs"
provides:
  - "migration 0005_connections (applied): connections, connection_secrets, bank_accounts, bank_statement_months, bank_transactions, webhook_events, consents, documents.connection_id, status_rank(), connection_set_status(), connection_record_event()"
  - "POST /api/webhooks/:provider with Truv v1= HMAC and Plaid ES256 adapters"
  - "queue() consumer with transient retry backoff, dead-letter handling, unmatched_payroll fallback"
  - "reconcileConnection(env, id, opts) dispatcher with the Truv payroll branch"
  - "BankProvider interface and PROVIDER_CAPABILITIES; targetMonths() 6-month window"
  - "test helpers: signTruv, makePlaidSigner, stubVendorFetch, seedConnectionFixture; Truv and Plaid webhook fixtures"
affects: [04-02, 04-03, 04-04, 04-05, 04-06, 04-07, 06-esign, 08-teller]

actuals:
  tokens: 38900
  tasks: 3
  commits: 19
plan_head_before: efe0c9a149cdf65022563214630e5b447a345835
plan_head_after: cb3f73a54502abbe55530eb03c808571d9a56eb7

tech-stack:
  added: []
  patterns:
    - "Webhook as hint, reconcile as truth: the route only verifies, records and enqueues an id; the consumer re-reads the vendor and writes status through one RPC"
    - "connection_set_status is the only writer of connections.status (monotonic rank, error repairable, removed terminal)"
    - "Optional vendor secrets typed through a global Env declaration merge (provider-env.d.ts), not secrets.required"

key-files:
  created:
    - supabase/migrations/0005_connections.sql
    - app/worker/src/routes/webhooks.ts
    - app/worker/src/webhooks/truv.ts
    - app/worker/src/webhooks/plaid.ts
    - app/worker/src/webhooks/adapters.ts
    - app/worker/src/jobs/index.ts
    - app/worker/src/jobs/reconcile.ts
    - app/worker/src/jobs/payroll-reconcile.ts
    - app/worker/src/db/connections.ts
    - app/worker/src/db/webhook-events.ts
    - app/worker/src/integrations/truv/client.ts
    - app/worker/src/integrations/truv/orders.ts
    - app/worker/src/integrations/bank/provider.ts
    - app/worker/src/integrations/provider-error.ts
    - app/worker/src/provider-env.d.ts
    - app/src/lib/statement-months.ts
    - app/worker/test/connections-tracer.test.ts
    - app/worker/test/connections-live.test.ts
    - app/worker/test/fixtures/connections.ts
  modified:
    - app/worker/src/index.ts
    - app/worker/test/rls.test.ts
    - docs/app/worker/src/index.md
    - docs/app/worker/test/rls.test.md

key-decisions:
  - "connection_set_status locks requests, then connections, then request_items (keeps 0004's request-before-item lock order so it cannot deadlock with upload_complete/item_approve)"
  - "mapOrderStatus checks all-completed before is_expired, so an expired order whose employers all finished stays done"
  - "NonRetryableError lives in integrations/provider-error.ts and is re-exported by jobs/index.ts (avoids a jobs/index <-> jobs/reconcile import cycle)"
  - "Constant-time compares use timingSafeEqual from node:crypto (works in workerd via nodejs_compat and in Node tests; crypto.subtle.timingSafeEqual is Workers-only)"
  - "webhook.rejected events go to defaultFirmId() (first firm; shortcut for single-firm v1) with a test seam so live tests stay under the test firm"

patterns-established:
  - "Phase 4 live suites seed through fixtures/connections.ts and clean webhook_events by the wh_fixture_ prefix only in the suite that posts them"
  - "Vendor HTTP in tests: stubVendorFetch routes by host/path/method and passes everything else to the real fetch"

requirements-completed: [WEBH-01, WEBH-03, PAY-04, BANK-04]

coverage:
  - id: D1
    description: "Migration 0005 applied live: 7 tables with RLS and zero anon/authenticated grants, documents.connection_id, 3 functions revoked from PUBLIC/anon/authenticated"
    requirement: WEBH-03
    verification:
      - kind: integration
        ref: "node app/scripts/db-migrate.mjs --dry-run (0 pending) + information_schema count queries (7 tables, 3 functions, 0 routine grants, 0 table grants, connection_id present)"
        status: pass
      - kind: integration
        ref: "app/worker/test/rls.test.ts (36 passed, live)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Signed Truv webhook -> 200 in ~100 ms -> one ledger row -> queue() -> stubbed order read -> connection done, item submitted, request waiting_on_staff, one connection.done event; duplicate and bad-signature paths"
    requirement: WEBH-01
    verification:
      - kind: integration
        ref: "app/worker/test/connections-tracer.test.ts (4 passed, live)"
        status: pass
      - kind: unit
        ref: "app/worker/src/routes/webhooks.test.ts (6 passed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Plaid ES256 verification: kid cache, 5-minute iat, raw-body SHA-256, HS256 rejected, event keys"
    requirement: WEBH-01
    verification:
      - kind: unit
        ref: "app/worker/src/webhooks/plaid.test.ts (11 passed), app/worker/src/webhooks/truv.test.ts (6 passed)"
        status: pass
    human_judgment: false
  - id: D4
    description: "connection_set_status monotonic rank matrix incl. concurrency, approved item untouched, error repairable, removed terminal"
    requirement: WEBH-03
    verification:
      - kind: integration
        ref: "app/worker/test/connections-live.test.ts (17 passed, live)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Consumer ack/retry backoff/dead/DLQ/unmatched_payroll and log allowlist"
    requirement: WEBH-01
    verification:
      - kind: unit
        ref: "app/worker/src/jobs/index.test.ts (13 passed)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Truv order -> connection status mapping (PAY-04 server half)"
    requirement: PAY-04
    verification:
      - kind: unit
        ref: "app/worker/src/integrations/truv/orders.test.ts (22 passed)"
        status: pass
    human_judgment: false
  - id: D7
    description: "BankProvider interface and PROVIDER_CAPABILITIES (plaid all true, teller transactions only); 6-month statement window"
    requirement: BANK-04
    verification:
      - kind: unit
        ref: "pnpm -C app run check (tsc -b green over provider.ts); app/src/lib/statement-months.test.ts (4 passed)"
        status: pass
    human_judgment: false

duration: 36min
completed: 2026-10-11
status: complete
---

# Phase 4 Plan 01: Connection framework tracer Summary

**Migration 0005 plus a raw-body-verified `/api/webhooks/:provider` (Truv HMAC, Plaid ES256), an idempotent webhook ledger, a retrying queue consumer, and the monotonic `connection_set_status` RPC, proven live from a signed Truv webhook to a `waiting_on_staff` request.**

## Performance

- **Duration:** about 36 min (08:57Z to 09:33Z)
- **Tasks:** 3 of 3
- **Files:** 65 changed by this plan's 4 commits (code, tests, fixtures, docs)
- **Deploy:** once, after `pnpm -C app run check` was green on the whole tree; version `e4be816d-0544-41d2-853e-6e5f6563d68a` at https://resspark.zh-a16.workers.dev. Deployed probe: `POST /api/webhooks/nope` → 404 `not_found`; `POST /api/webhooks/truv` → 401 `invalid_signature` (no Truv secret on the Worker yet).

## Accomplishments

- Migration `0005_connections` applied to `zvkphuikjpwoauqdimcf` on the first run (no statement needed a rerun). `--dry-run` prints `0 pending`; 7 tables, 3 functions, 0 PUBLIC/anon/authenticated routine grants, 0 anon/authenticated table grants in `public`, `documents.connection_id` present.
- The webhook route reads `c.req.text()` once, verifies, records `(provider, event_key)` once, and enqueues `{ type: 'webhook', provider, ref }`. Measured first POST in the live tracer: **98 ms** (handler 86 ms).
- The consumer re-reads the Truv order (`GET https://prod.truv.com/v1/orders/{id}/` with `X-Access-Client-Id` / `X-Access-Secret`), writes `data.employers`, and applies the mapped status through the RPC. It retries transient errors with `min(60·2^attempts, 86400)` s, acks and records everything else, and handles DLQ messages.
- `connection_set_status` is proven monotonic live across 17 cases, including the concurrent `Promise.all(connected, syncing)` case (final `syncing`).

## Task Commits

1. **Task 1: migration, route, consumer, Truv reconcile tracer**: `fbd0165` (feat)
2. **Task 2: Plaid ES256 adapter**: `c94823d` (test, RED), `9befe58` (feat, GREEN)
3. **Task 3: live rank matrix, consumer/mapping/months tests, RLS**: `59493d1` (test)

`commits: 19` in the frontmatter is the measured `git rev-list --count plan_head_before..plan_head_after`. Two other executors (02-08 and 03-06/03-07) committed on the same branch during this run; 4 of the 19 are this plan's.

## Recorded facts the plan asked for

- **First-POST latency:** 98 ms (under the 1 s budget).
- **Fixture module:** a new self-contained `app/worker/test/fixtures/connections.ts` was written. Phase 3's `fixtures/request.ts` existed on disk but was untracked (owned by the concurrent 03-07 executor), so importing it could have left a commit that references an uncommitted file.
- **Phase 2 `clientSession` variable:** `c.var.client` (set with `c.set('client', …)` in `middleware/client-session.ts`). This plan's fixture needs no cookie, so it does not use it.
- **Duplicate insert behaviour:** `upsert(..., { onConflict: 'provider,event_key', ignoreDuplicates: true }).select('id').maybeSingle()` returns `data: null`, `error: null` for a duplicate (PostgREST `ON CONFLICT DO NOTHING RETURNING id` returns no row). The route answers 200 `{ ok: true, duplicate: true }` and enqueues nothing. Observed live.
- **Migration reruns:** none.

## Decisions Made

See `key-decisions` in the frontmatter. In short:

- The RPC takes the lock on the request before the connection and the item, matching migration 0004's lock order.
- The order mapping checks "everything finished" before checking expiry.
- `NonRetryableError` sits next to `ProviderError` so the job modules do not import each other in a cycle.
- Constant-time compares use `node:crypto`'s `timingSafeEqual`.
- `webhook.rejected` events go to the first firm, behind a single-firm `shortcut:` comment.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Lock order in `connection_set_status`**
- **Found during:** Task 1
- **Issue:** The plan said to lock the connection, then the item, then call `request_apply_status` (which updates the request). Phase 3's RPCs lock the request before the item. Using both orders on the same request could deadlock.
- **Fix:** The RPC reads `request_id` without a lock, then locks `requests`, then `connections`, then `request_items`, all `FOR UPDATE`.
- **Files:** `supabase/migrations/0005_connections.sql`
- **Commit:** `fbd0165`

**2. [Rule 3 - Blocking] `service_role` EXECUTE grants**
- **Found during:** Task 1
- **Issue:** After `REVOKE EXECUTE … FROM PUBLIC`, the Worker role cannot call the new functions. Phases 1 to 3 handle this with explicit grants.
- **Fix:** Added `GRANT EXECUTE … TO service_role` for all three functions. The verify gate checks only PUBLIC, anon, and authenticated, so it still reads 0.
- **Commit:** `fbd0165`

**3. [Rule 3 - Blocking] Optional vendor secrets missing from `Env`**
- **Found during:** Task 1
- **Issue:** `wrangler types` does not emit `TRUV_*` or `PLAID_*`, because they must stay out of `secrets.required`.
- **Fix:** Added `app/worker/src/provider-env.d.ts`, a global `interface Env` merge with five optional strings, plus its doc.
- **Note for Plan 02:** if `cf-typegen` later emits `PLAID_ENV` as a var, delete that member here.
- **Commit:** `fbd0165`

**4. [Rule 3 - Blocking] `crypto.subtle.timingSafeEqual` is missing in Node**
- **Found during:** Task 1
- **Issue:** `crypto.subtle.timingSafeEqual` is Workers-only, so the worker-node tests would fail on it.
- **Fix:** Both adapters import `timingSafeEqual` from `node:crypto`, which works in Workers through `nodejs_compat` and in Node.
- **Commit:** `fbd0165`, `9befe58`

**5. [Rule 3 - Blocking] `ExportedHandler<Env>` rejects a typed queue body**
- **Found during:** Task 1
- **Fix:** Changed the default export to `satisfies ExportedHandler<Env, Job>`.
- **Commit:** `fbd0165`

**6. [Rule 2 - Missing critical] Webhook route hardening**
- **Found during:** Task 1
- **Fix:** Adapter lookup uses `Object.hasOwn`, so `/api/webhooks/constructor` returns 404 instead of a 500. This is covered by `webhooks.test.ts`. The consumer logs only snake_case tokens it threw itself; any other error message becomes `internal`, so Postgres or vendor text never reaches the logs. This is covered by `index.test.ts`.
- **Commit:** `fbd0165`

**7. [Rule 2 - Test isolation] `defaultFirmId` test seam and fixture webhook cleanup**
- **Found during:** Task 1
- **Issue:** The negative live test would have written `webhook.rejected` under ValorTax (the first firm). A shared `cleanup()` that deleted `wh_fixture_*` rows could also race the parallel matrix suite.
- **Fix:** Added `_setDefaultFirmIdForTests`. The suite that posts the webhooks calls `deleteFixtureWebhooks`; the shared `cleanup()` no longer does.
- **Commit:** `fbd0165`

**8. [Rule 1 - Bug, test only] `vi.fn()` call history is cleared between tests in this config**
- **Fix:** The tracer records jobs in a plain array.
- **Commit:** `fbd0165`

**9. [Rule 2 - Additive] Extra helper and extra tests**
- **Fix:** Added `findConnectionByEmployerLink` to `db/connections.ts`, used by `connectionIdForWebhook` for Truv `link_id` lookups. `rls.test.ts` also probes the `connection_set_status` RPC.
- **Commit:** `fbd0165`, `59493d1`

**Total deviations:** 9 auto-fixed: 2 bugs, 5 blocking, 2 critical or isolation. No contract change for Plans 02 to 07.

## Issues Encountered

- The `pending → in_progress` item mapping is implemented as specified, but nothing reaches it today. Connections are inserted as `pending`, and `pending → pending` is an equal-status no-op. Plan 03 can call it if the "started" signal should move the item.
- The Plaid item-webhook event key uses the JWT `iat` as the timestamp (`[ASSUMED]`, documented in `docs/app/worker/src/webhooks/plaid.md`).

## Known Stubs

- `app/worker/src/jobs/reconcile.ts`: the `bank` branch throws `NonRetryableError('bank_not_available')`. Plan 04 replaces it. This is intentional and was named in the plan.
- `app/worker/src/jobs/index.ts`: `remove_item` throws `NonRetryableError('job_not_available')`. Plan 04 wires it. Intentional.

## User Setup Required

None for this plan. The Truv and Plaid keys and the dashboard webhook endpoints are tracked by Plans 02 and 07 (USER ACTION).

## Next Phase Readiness

- Plan 02 (cron, Refresh, wrangler config, `--provider` secrets) can build on `reconcileConnection`, `listNonTerminalConnections`, and `webhook_events_status_idx`.
- Plans 03 and 04 plug into `reconcilePayroll` and the `bank` branch, and reuse the fixtures and signers.

## Self-Check: PASSED

- The 19 created key files and 4 modified key files exist on disk.
- Commits `fbd0165`, `c94823d`, `9befe58`, `59493d1` are ancestors of HEAD.
- Task 1 automated verify passed (migration runner, 5 count queries, `test:live`, `check-file-sizes`).
- Task 2 verify passed: plaid 11, truv 6, webhooks 6.
- Task 3 verify passed: index 13, orders 22, months 4, `test:live` 18 files and 259 tests with 0 failed.
- `pnpm -C app run check` passed: 843 tests passed, 105 skipped (the live suites without env), 0 failed.
