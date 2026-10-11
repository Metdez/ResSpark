---
phase: 04-connect-payroll-bank
plan: 03
subsystem: worker/payroll
status: complete
tags: [truv, payroll, consent, csp, storage, documents]
requires: [04-01, 04-02]
provides:
  - "POST /api/c/consents, GET /api/c/items/:itemId/connection, POST /api/c/connections/:kind/start, POST /api/c/connections/:id/reconcile"
  - "startPayroll (row before order, order reuse, order_expired re-create)"
  - "payroll reconcile fetch: income report + link documents + files per completed employer"
  - "storeProviderFile / providerObjectPath / employerSlug (reused by Plan 04-04 for bank statements)"
  - "CONSENT_TEXT shared SPA/Worker; clientCsp on /c/*"
affects: [04-04, 04-05, 04-06, 04-07]
tech-stack:
  added: []
  patterns:
    - "lazy byte loader: storeProviderFile downloads only when storage_key is not stored yet"
    - "MD5 via node:crypto under nodejs_compat (no hand-written MD5)"
key-files:
  created:
    - app/src/lib/consent-text.ts
    - app/worker/src/db/consents.ts
    - app/worker/src/integrations/configured.ts
    - app/worker/src/integrations/truv/start.ts
    - app/worker/src/integrations/truv/reports.ts
    - app/worker/src/storage/connection-files.ts
    - app/worker/src/routes/c-connections.ts
    - app/worker/src/middleware/client-csp.ts
    - app/worker/test/payroll-start.test.ts
    - app/worker/test/payroll-fetch.test.ts
    - app/worker/src/routes/c-connections.test.ts
    - app/worker/src/middleware/client-csp.test.ts
    - app/worker/src/jobs/payroll-reconcile.test.ts
    - app/worker/src/integrations/truv/reports.test.ts
    - app/worker/src/storage/connection-files.test.ts
  modified:
    - app/worker/src/integrations/truv/orders.ts
    - app/worker/src/jobs/payroll-reconcile.ts
    - app/worker/src/index.ts
    - app/worker/test/connections-tracer.test.ts
    - .gitattributes
decisions:
  - "MD5 for Truv md5sum uses node:crypto (nodejs_compat is on) instead of a pure-TS RFC 1321 implementation"
  - "stripFileUrls also drops the income report's access_token before it is stored in connections.data"
  - "employerSlug never truncates the -<employer_id> suffix (connections-ops attributes files by it)"
  - "StartCtx has no firmName: Truv needs none; Plan 04 startBank reads the firm itself"
  - "*.pdf marked binary in .gitattributes so fixture md5 values survive autocrlf checkouts"
metrics:
  duration: "46 min"
  completed: 2026-10-11
actuals:
  tokens: 26300
  tasks: 3
  commits: 3
plan_head_before: 80b0ac9a10ff77b63f4998857f9de8f863b9dc32
plan_head_after: ac6ed86
---

# Phase 4 Plan 03: Payroll vertical (consent, Truv start, report and file fetch, portal CSP) Summary

A client with the link cookie agrees to a versioned "Use of data" text, starts one Truv order per payroll item (reused across taps so more employers join it), and every completed employer's income report, pay stubs, W-2s and in-Bridge uploads land in the case as `ready` documents attributed per employer, downloaded in the job that saw the URLs, md5-checked, and never duplicated on rerun. `/c/*` carries the CSP Truv Bridge and Plaid Link need.

## Tasks

| Task | Name | Commit | Key files |
|------|------|--------|-----------|
| 1 | Consent, payroll start, item view, client reconcile, CSP (tracer, live) | a7a9de4 | consent-text.ts, db/consents.ts, configured.ts, truv/start.ts, routes/c-connections.ts, middleware/client-csp.ts, index.ts, test/payroll-start.test.ts |
| 2 | Payroll fetch: reports, files, Storage, documents, idempotent rerun (live) | 4812d4e | truv/reports.ts, storage/connection-files.ts, jobs/payroll-reconcile.ts, test/payroll-fetch.test.ts, fixtures |
| 3 | Route guards, CSP, order creation, expiry and partial-employer rules under unit test | ac6ed86 | c-connections.test.ts, client-csp.test.ts, orders.test.ts, payroll-reconcile.test.ts |

## Answers the plan asked to record

- **case_id for the session:** reused the Phase 3 helper `sessionRequest(env, requestId, firmId)` from `db/documents.ts`, then `getCase` from `db/cases.ts`.
- **MD5:** neither `reports.ts`-inline pure TS nor `md5.ts`: `md5Hex` is one line over `node:crypto` `createHash('md5')` in `reports.ts` (`nodejs_compat` is enabled; `webhooks/plaid.ts` already imports `node:crypto` in production code).
- **Live fetch document counts:** 6 documents for the two-employer order: income_report 1, pay_stub 3, w2 1, form_1099 1; 5 under `/payroll/acme-inc-emp_1/`, 1 under `/payroll/beta-llc-emp_2/`. Employer counts Acme 2/1/1, Beta 1/0/0. The duplicate stub URL in `/documents/` collapsed into one file.
- **order_number suffixing:** implemented (`<request id>-<n>` after the first Truv connection on an item) but not exercised against real Truv (no keys); the live start test only covers the first order (`order_number` = request id).
- **CSP as deployed** (`https://resspark.zh-a16.workers.dev/c/`, version 66d6526f):
  `default-src 'self'; script-src 'self' https://cdn.truv.com https://cdn.plaid.com; frame-src https://my.truv.com https://cdn.plaid.com; connect-src 'self' https://*.truv.com https://*.plaid.com https://zvkphuikjpwoauqdimcf.supabase.co https://*.storage.supabase.co; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; worker-src 'self' blob:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`
  `/admin/` carries no CSP.

## Verification

- `pnpm -C app run test:live`: 25 files, 319 tests, all passed on the final run (includes `payroll-start.test.ts` 9 tests and `payroll-fetch.test.ts` 3 tests).
- Unit: `c-connections.test.ts` 13, `client-csp.test.ts` 4, `orders.test.ts` 25, `reports.test.ts` 9 (8+ asked), `connection-files.test.ts` 7 (6+ asked), `payroll-reconcile.test.ts` 2.
- `pnpm -C app run check` passed end to end on the whole tree (file sizes, golden, tsc, eslint, tests: 95 files passed).
- Deployed once with `pnpm -C app run deploy`; `/api/c/items/:id/connection` without a cookie answers 401.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] Report access token kept out of the database**
- Found during: Task 2. The Truv income report body carries `access_token`; `stripFileUrls` now drops that key too, and the live test asserts it is absent from `connections.data`.
- Commit: 4812d4e

**2. [Rule 1 - Bug] Employer id suffix could be truncated**
- Found during: Task 2. The plan's `max 60 chars` on the whole slug would cut `-<employer_id>` for long company names, and `connections-ops.ts` attributes files by that suffix. The company part is shortened instead. Unit-tested.
- Commit: 4812d4e

**3. [Rule 3 - Blocking] Tracer test would call real Truv**
- Found during: Task 2. `connections-tracer.test.ts` (Plan 04-01) uses an order with two completed employers; the new fetch would hit `prod.truv.com` unstubbed. Added empty report/document stubs and counted only order calls there; doc updated.
- Commit: 4812d4e

**4. [Rule 3 - Blocking] Fixture md5 must survive checkout**
- `core.autocrlf=true` would rewrite `tiny.pdf` line endings on another checkout and break the pasted md5. Added `*.pdf binary` to `.gitattributes`.
- Commit: 4812d4e

**5. Simplifications (no behavior change vs the contract)**
- MD5 via `node:crypto` (see above) instead of ~60 lines of hand-written MD5.
- `truvDownload(url)` takes no `env` (pre-signed URL, nothing to read from env).
- `storeProviderFile` accepts a lazy loader for `bytes` so "existing keys are skipped before download" holds literally; the job passes a loader that downloads and md5-checks.
- `StartCtx` has no `firmName` (unused for Truv).
- The live fetch test uses order id `ord_fixture_fetch` instead of `ord_fixture_1`, because live files run in parallel and the tracer deletes `ord_fixture_1` rows in its `beforeAll`.
- Added `payroll-reconcile.test.ts` (not in the plan's file list) for the Task 3 expiry/partial behaviors.

## Not covered / known limits

- **PAY-03 concurrency truth, live half:** a client manual upload to a `payroll_connect` item is refused today by Phase 3's `c-uploads` (`item_not_upload`); the fallback route is Plan 04-05. Non-collision holds by construction (provider files under `.../item/<item>/payroll/...`, client files under `.../item/<item>/<document_id>/...`, unique `storage_key`) and is documented, but no live test uploads to the payroll item yet.
- No Truv keys exist: everything ran against stubs; real order creation, real `order_number` uniqueness and real file URL expiry remain unverified.
- `connections-ops-live.test.ts` failed once in a full parallel live run (hook-level, passes alone and on the next full run). It does not touch this plan's code; treat as a flaky parallel-load timeout.

## Threat Flags

None beyond the plan's threat model (T-04-12..T-04-17 mitigated as planned).

## Shared-file notes

`app/worker/src/index.ts` and `docs/app/worker/src/index.md` had no foreign hunks when committed (a7a9de4). Another executor had staged unrelated `.claude/skills/...` files in the shared index; this plan's commits used `git commit -- <paths>` and did not include them.

## Self-Check: PASSED

- Files: all key files listed above exist on disk.
- Commits a7a9de4, 4812d4e, ac6ed86 are ancestors of HEAD.
