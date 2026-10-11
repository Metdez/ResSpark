---
phase: 02-find-the-client-send-the-link
plan: 04
subsystem: api
tags: [requests, client-link, send, logics-refetch, resend, sms-consent, hono, smoke]

requires:
  - phase: 02-find-the-client-send-the-link
    provides: "0003 request RPCs and seeded templates (02-01); Logics read module and shared contact Zod (02-02); lookup/confirm routes, getCase, getIntegration, rpcErrorToken (02-03)"
  - phase: 01-foundation-staff-sign-in
    provides: "staffAuth, logEvent, hmacKey/mintLinkToken/uuidToBytes/verifyLinkToken, /c/:token exchange, smoke --auth, deploy script"
provides:
  - "GET /api/admin/requests/templates, POST /api/admin/requests, GET /api/admin/requests, GET /api/admin/requests/:id"
  - "POST /api/admin/requests/:id/send|regenerate|revoke|email|consent|copied"
  - "db/requests.ts: getTemplates, createRequest, listRequests, getRequest (with firm_name), sendRequest, regenerateLink, revokeRequest"
  - "integrations/email/resend.ts: sendLinkEmail (best-effort, fetch, escaped HTML)"
  - "Exported helpers for later routes: linkUrl, rpcToHttp, readBody, requestIdParam, AdminApp; toHttp from admin-lookup"
  - "Deployed smoke check 'auth request send' (fixture mode)"
affects: [02-05, 02-06, 02-07, 02-08]

actuals:
  tokens: 21000
  tasks: 3
  commits: 14
plan_head_before: 4a7385770962416a02e47243a74c566dff965daa
plan_head_after: 15802674f7233c99f194c4ebf119740d28bc5dc4

tech-stack:
  added: []
  patterns:
    - "Two Hono sub-apps share /api/admin/requests; staffAuth is idempotent (skips when staff is set) so the token is verified once"
    - "Refusals that need extra fields use c.json with the standard envelope plus fields, and set errorCode for the logger"
    - "Client URL minted per response from the link row (never stored), null once revoked"

key-files:
  created:
    - app/worker/src/db/requests.ts
    - app/worker/src/routes/admin-requests.ts
    - app/worker/src/routes/admin-request-actions.ts
    - app/worker/src/integrations/email/resend.ts
    - app/worker/src/integrations/email/resend.test.ts
    - app/worker/test/admin-requests.test.ts
    - app/worker/test/admin-request-actions.test.ts
    - app/worker/test/requests-fixtures.ts
    - docs/app/worker/src/db/requests.md
    - docs/app/worker/src/routes/admin-requests.md
    - docs/app/worker/src/routes/admin-request-actions.md
    - docs/app/worker/src/integrations/email/resend.md
    - docs/app/worker/src/integrations/email/resend.test.md
    - docs/app/worker/test/admin-requests.test.md
    - docs/app/worker/test/admin-request-actions.test.md
    - docs/app/worker/test/requests-fixtures.md
  modified:
    - app/worker/src/index.ts
    - app/worker/src/middleware/staff-auth.ts
    - app/worker/src/routes/admin-lookup.ts
    - app/scripts/smoke.mjs
    - docs/app/worker/src/index.md
    - docs/app/worker/src/middleware/staff-auth.md
    - docs/app/worker/src/routes/admin-lookup.md
    - docs/app/scripts/smoke.md

key-decisions:
  - "One keep_flagged acknowledgement covers both the did-you-mean suggestion and the differs-from-Logics flag, so the SPA needs a single 'Use this value anyway' control; contact_overridden is true only when a flagged value was kept"
  - "requests.contact_email / contact_phone_e164 hold the checkContact output (lowercased email, E.164 phone) set by request_send; the email action always sends to contact_email and never reads a body"
  - "The send-time Logics comparison normalizes the fresh phone with normalizePhone (cell, home, work order), exactly as confirm stored cases.phone_e164"
  - "staffAuth skips when c.var.staff is already set, because two sub-apps mounted at /api/admin/requests each declare it"
  - "The email action logs request.email_failed for not_configured as well as send_failed, so every attempt is auditable"

requirements-completed: [REQ-01, REQ-02, REQ-03, REQ-04, REQ-05, LOOK-04]

coverage:
  - id: D1
    description: "Templates list, draft creation from a template (validated items, positions in posted order, no dedupe), list, and firm-scoped detail with a re-derived link URL"
    requirement: "REQ-01"
    verification:
      - kind: unit
        ref: "app/worker/test/admin-requests.test.ts (templates and drafts; GET /:id)"
        status: pass
      - kind: smoke
        ref: "pnpm -C app run smoke:auth https://resspark.zh-a16.workers.dev --auth (ok auth request send)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Send: server-side contact gate, contact_flagged with keep_flagged override, send-time CaseInfo re-read refusing case_changed, request_send, copyable URL whose token verifies"
    requirement: "REQ-02, LOOK-04"
    verification:
      - kind: unit
        ref: "app/worker/test/admin-requests.test.ts#POST /api/admin/requests/:id/send"
        status: pass
      - kind: smoke
        ref: "smoke --auth: ok auth request send (URL shape, version 1, link opens with 302)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Regenerate bumps version (old token fails), revoke sets revoked and second revoke is 409"
    requirement: "REQ-03"
    verification:
      - kind: unit
        ref: "app/worker/test/admin-request-actions.test.ts (regenerate, revoke)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Best-effort Resend email to the stored contact with fixed, escaped copy; not_configured without a key"
    requirement: "REQ-04"
    verification:
      - kind: unit
        ref: "app/worker/src/integrations/email/resend.test.ts (8 tests); admin-request-actions.test.ts#POST /:id/email"
        status: pass
      - kind: smoke
        ref: "smoke --auth: email action returned not_configured on the deployed Worker"
        status: pass
    human_judgment: false
  - id: D5
    description: "SMS consent event and link-copied event, no SMS sent"
    requirement: "REQ-05"
    verification:
      - kind: unit
        ref: "app/worker/test/admin-request-actions.test.ts (consent, copied, no outbound fetch)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Email delivery to a real recipient"
    requirement: "REQ-04"
    human_judgment: true
    rationale: "Needs a Resend API key and verified sending domain (USER ACTION); not_configured is the measured path until then"

duration: 30min
completed: 2026-10-11
status: complete
---

# Phase 2 Plan 04: Request Lifecycle API Summary

**Staff can now turn a confirmed case into a request and a link. The flow is: pick a template, create the draft, then send. Send re-checks the contact with the shared Zod rules and re-reads the case from Logics. It refuses if the record changed, creates the link transactionally, and returns a copyable `/c/<token>` URL minted with the Phase 1 primitives. Regenerate, revoke, best-effort Resend email, SMS-consent, and link-copied actions complete the lifecycle. The Worker is redeployed, and a new smoke check proves the send flow live in fixture mode.**

## Performance

- **Duration:** about 30 min
- **Started:** 2026-10-11T07:19:42Z
- **Completed:** 2026-10-11T07:49:27Z
- **Tasks:** 3, all TDD: a RED commit, then a GREEN commit
- **Files:** 16 created, 8 modified

## Accomplishments

- `GET /templates` returns the global templates plus the firm's own. `POST /` checks every item: one of the six kinds, a label of 1 to 120 characters, a boolean `required`, and an object `config`. It rebuilds each item from those four keys, resolves the template name by id (404 if unknown), and creates the draft through `request_create`. The result is 201 `{ request_id }`. `no_items` returns 400 and `case_not_found` returns 404. The same body sent twice creates two drafts.
- `GET /:id` returns the request, its items in `position` order, the case identity, and the link block. The URL is re-minted on every response and is `null` once revoked. `GET /` lists the firm's requests, newest first.
- `POST /:id/send` checks the request in this order:
  1. Body shape, then `checkContact` (400 `contact_invalid` with field errors).
  2. The did-you-mean and differs-from-Logics flags (409 `contact_flagged` unless `keep_flagged`).
  3. A fresh `Case/CaseInfo` (409 `case_changed`, naming the fields, or `['case']` when Logics no longer has it).
  4. `request_send`.

  The response is `{ url, expires_at, version }`, and the `request.sent` payload records `to_email`, `to_phone_e164`, `contact_overridden`, and `logics_case_id`.
- Regenerate bumps `version`, so the old token stops verifying (tested). Revoke is idempotent-refusing: a second revoke returns 409 `request_revoked`. Consent needs the literal `agreed: true` and writes one `consent.sms` event per call with the destination phone. Copied writes one `request.link_copied` event per call. The platform sends no SMS.
- `sendLinkEmail` makes one `fetch` POST to Resend with a bearer key and a JSON body. The copy names only the agent, the firm, the link, and the expiry, and the names are HTML-escaped. It returns `not_configured` without a key and `send_failed` on a non-2xx response or a thrown error, with no retry. The email action reads no body, sends to the stored `contact_email`, and returns 200 with the result: `ok`, `not_configured`, `send_failed`, or `no_link`. It logs `request.email_sent` or `request.email_failed`.
- Deployed version `abdb1772-7c44-4043-917b-754794d5de9b` at https://resspark.zh-a16.workers.dev. Smoke `--auth` shows 15/15 `ok`, including the new `ok auth request send`. That check confirms 900001, creates a draft, sends it, opens the link (302), records a copy, sees email return `not_configured`, then deletes the probe request.

## Task Commits

1. **Task 1: Templates, draft, detail, send (tracer)**: `68b148a` (test, RED), `09bd6cb` (feat, GREEN). The tracer gate re-ran the verify command (28/28 passed), and expansion continued: "Tracer verified end-to-end — expanding".
2. **Task 2: Regenerate, revoke, consent, copied**: `1e54dad` (test, RED), `e3805f3` (feat, GREEN).
3. **Task 3: Resend email and redeploy**: `650e75c` (test, RED), `ce58a18` (feat, GREEN), and `1580267` (test: the deployed smoke check for the send flow).

The ledger range `4a73857..1580267` holds 14 commits. Seven are this plan's. The other seven are Plan 02-05's commits and one orchestrator STATE commit, which landed on the shared branch during the run.

## TDD Gate Compliance

| Task | Target test | RED classifier | Semantic assessment |
|------|-------------|----------------|---------------------|
| 1 | `admin-requests.test.ts > POST /api/admin/requests/:id/send > validates, re-reads Logics, sends, and returns a copyable URL that verifies` | RED_EVIDENCE_OK (target_test_failed) | It failed on `expect(res.status).toBe(200)` with 404, because the stub sub-apps had only `staffAuth` and no handlers. That is the intended reason. In the full run, 23 tests failed and 4 passed: the 401 check and the 404 paths, which the stubs already satisfied. |
| 2 | `admin-request-actions.test.ts > POST /:id/consent > logs consent.sms with the agent id and the destination number` | RED_EVIDENCE_OK (target_test_failed) | It failed on the status assertion (404, no handler). 11 tests failed and 5 passed: the firm-scoping 404s and the no-outbound check, which the stub satisfied trivially. |
| 3 | `resend.test.ts > sendLinkEmail > posts JSON to Resend with the bearer key and returns the email id` | RED_EVIDENCE_OK (target_test_failed), on the second record | The first record was INVALID_RED (`invalid_record`). Vitest's tap-flat reporter prints multi-line object diffs, and the classifier rejects those as malformed TAP. The target test's first assertion became `expect(result.ok).toBe(true)`, which gives a one-line diff, and only the target ran (`-t`). It then failed with `expected false to be true` against the stub, which always returns `send_failed`. That is the intended reason. The assertion tweak shipped in the GREEN commit. |

## Decisions Made

See `key-decisions` in the frontmatter. The two the plan asked to record:

- **`keep_flagged` design:** one acknowledgement covers both flags, so the SPA shows a single "Use this value anyway" control. `contact_overridden` is true only when a flagged value was actually kept.
- **`contact_email` / `contact_phone_e164`:** `request_send` stores the validated `checkContact` output on the request. The email action reads only `contact_email`, and consent logs `contact_phone_e164` (or the case phone before send).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Double token verification across the two request sub-apps**
- **Found during:** Task 1
- **Issue:** Both sub-apps mount at `/api/admin/requests` with `use('*', staffAuth)`. Hono composes them, so action paths ran `staffAuth` twice: two JWT verifications and two profile reads per request.
- **Fix:** `staffAuth` now continues straight away when `c.var.staff` is already set. Only `staffAuth` sets it, so the request cannot bypass the guard. A test asserts `getStaffProfile` is called once per send.
- **Files:** `app/worker/src/middleware/staff-auth.ts`, `docs/app/worker/src/middleware/staff-auth.md`
- **Commit:** `09bd6cb`

**2. [Rule 3 - Blocking] Logics error mapper reused instead of duplicated**
- **Found during:** Task 1
- **Issue:** The send-time re-read needs the same `LogicsError` → 409/502 mapping as lookup.
- **Fix:** `toHttp` in `admin-lookup.ts` is now exported and imported as `logicsToHttp`. Its behavior is unchanged.
- **Commit:** `09bd6cb`

**3. [Rule 2 - Missing critical] Extra validation**
- Non-UUID `:id` returns 400 before any read. Non-string `email`/`phone` and a non-boolean `keep_flagged` return 400. Posted items are capped at 50. The email action also returns `no_link` when the request has no stored `contact_email`. Refusals set `errorCode` so the allowlisted logger records them.
- **Commits:** `09bd6cb`, `ce58a18`

**4. [Rule 2 - Verification] Deployed proof of the send flow**
- **Issue:** The orchestrator's success criteria require the template → draft → send → URL flow proven live in fake mode. The existing smoke only covered lookup.
- **Fix:** Added the `auth request send` check to `app/scripts/smoke.mjs`. It runs only in fake mode and deletes its probe request afterwards. It never prints the URL or the token.
- **Commit:** `1580267`

**5. [Shared test setup]** `app/worker/test/requests-fixtures.ts` (with a companion doc) holds the staff-JWT fabrication, env, and row builders for both route test files, instead of copying them into each file.

### Tooling Notes

- `pnpm -C app exec vitest run …` was used, per the orchestrator note. Deploy ran through `pnpm -C app run deploy`, and smoke through `pnpm -C app run smoke:auth <url> --auth`, the package script equivalent of the plan's dotenv command.
- `pnpm -C app run check` was red three times on Plan 02-05's in-progress files (`lookup-page`, `lookup-api`, and the stale `routeTree.gen.ts` route key). Every failure was confined to its files. The fourth run was green (tsc, eslint with 0 errors, 625 passed and 52 skipped), and the deploy ran after it.

**Total deviations:** 4 auto-fixed (1 bug, 1 blocking, 2 missing critical/verification) and 1 structural note. **Impact:** no scope change, and every acceptance criterion passes.

## Issues Encountered

- The INVALID_RED caused by the TAP reporter format, described in the TDD table above. It was resolved without changing behavior.

## USER ACTION REQUIRED

1. Create a Resend account and an API key (Resend Dashboard → API Keys → Create API Key). Then run `pnpm -C app wrangler secret put RESEND_API_KEY` and enter the value over stdin.
2. Verify a sending domain (Resend Dashboard → Domains) and set `RESEND_FROM` in the `app/wrangler.jsonc` `vars`, then redeploy with `pnpm -C app run deploy`. Until then the email action returns `not_configured` and the app shows "Email not configured". **The copy-link path is the demo path.** With only the key set, `onboarding@resend.dev` delivers only to the Resend account owner.

## Verification

- `pnpm -C app exec vitest run --project worker-node worker/test/admin-requests.test.ts worker/test/admin-request-actions.test.ts worker/src/integrations/email/resend.test.ts`: 3 files, 58 passed (28 + 22 + 8).
- `pnpm -C app run check`: exit 0 (size gate, golden fixtures, `tsc -b`, eslint with 0 errors, 625 passed and 52 skipped).
- `bash app/scripts/hygiene-check.sh`: `hygiene ok`.
- `pnpm -C app run deploy`: green, version `abdb1772-7c44-4043-917b-754794d5de9b`.
- Smoke `--auth` against https://resspark.zh-a16.workers.dev: 15/15 `ok`, including `ok auth lookup fixture` and `ok auth request send`.
- Acceptance greps for all three tasks pass. `grep -c "fetch(" app/worker/src/routes/admin-request-actions.ts` prints 0, and `c.req.json` does not appear in that file. `resend.ts` has no `retry`, `tax debt`, or `console.`.

## Next Phase Readiness

Plans 05 and 06 (SPA) can bind to the ten routes exactly as specified in the plan's `<interfaces>`. Two details matter. `contact_flagged` carries `email_suggestion` and `differs` beside the error envelope. `contact_invalid` carries `email_error` and `phone_error`. Plan 08's end-to-end smoke can extend `requestSend` in `smoke.mjs`.

## Self-Check: PASSED
