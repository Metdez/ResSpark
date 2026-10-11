---
phase: 02-find-the-client-send-the-link
plan: 07
subsystem: api
tags: [client-portal, cookie-session, csrf, rate-limit, heartbeat, hono, smoke]

requires:
  - phase: 02-find-the-client-send-the-link
    provides: "request_open RPC, client_sessions table, rpc error tokens (02-01); request routes and smoke patterns (02-04)"
  - phase: 01-foundation-staff-sign-in
    provides: "GET /c/:token exchange setting the signed rs_client cookie, cookieSecret, findClientLink, uuidToBytes, link-rate-limit in-memory window, uniform 404s, allowlisted logger"
provides:
  - "GET /api/c/state → allow-listed PortalState; POST /api/c/start → { opened_at } via request_open; POST /api/c/heartbeat → client_sessions upsert"
  - "middleware/client-session.ts: clientSession (cookie-only identity, one 401 no_session), requireClientHeader (X-Requested-With: ResSpark, 403 bad_origin), ClientCtx"
  - "db/portal.ts: getPortalState, openRequest, upsertClientSession, PortalState, PortalStep"
  - "allowInWindow(key, limit, periodMs) exported from link-rate-limit.ts"
  - "clientPrivacyHeaders in index.ts on /c/* and /api/c/*"
  - "Smoke checks: '/api/c 401 no_session', '/api/c start 401', and --auth 'auth /api/c portal' (live state/start/heartbeat behind a real cookie)"
affects: [02-08, phase-03-mirror-view]

actuals:
  tokens: 13200
  tasks: 2
  commits: 10
plan_head_before: 3266702b5de02316ea8b4445dc637193b8af1b5b
plan_head_after: 405cca95313eac00bbcaf13ad342a9caee8180ce

tech-stack:
  added: []
  patterns:
    - "Client identity comes only from the signed rs_client cookie; the link row is re-read on every /api/c call"
    - "POST /api/c/* requires X-Requested-With: ResSpark on top of the SameSite=Lax cookie"
    - "Portal DTOs are built from an explicit field list, never a spread row"
    - "In-memory limiter keys are namespaced (link:<ip>, hb:<link id>) over one shared window"

key-files:
  created:
    - app/worker/src/middleware/client-session.ts
    - app/worker/src/db/portal.ts
    - app/worker/src/routes/client-portal.ts
    - app/worker/test/client-portal.test.ts
    - docs/app/worker/src/middleware/client-session.md
    - docs/app/worker/src/db/portal.md
    - docs/app/worker/src/routes/client-portal.md
    - docs/app/worker/test/client-portal.test.md
  modified:
    - app/worker/src/index.ts
    - app/worker/src/middleware/link-rate-limit.ts
    - app/scripts/smoke.mjs
    - docs/app/worker/src/index.md
    - docs/app/worker/src/middleware/link-rate-limit.md
    - docs/app/scripts/smoke.md

key-decisions:
  - "CSRF header is X-Requested-With: ResSpark on every POST /api/c/* (403 bad_origin); clientSession runs first, so no cookie is 401 before the header check"
  - "One 401 no_session body for missing, forged, expired-cookie, revoked, expired-link, unknown-link, malformed payload, and a request deleted under the link"
  - "Per-link heartbeat window is the in-memory allowInWindow('hb:<link>', 10, 60 s) with a shortcut: comment; upgrade path is a Workers Rate Limiting binding keyed by link (LINK_RATE_LIMITER is per IP for the exchange)"
  - "PortalState allow-list: firm_name, agent_display_name, status, opened_at, expires_at, steps[id, position, kind, label, required, status]; no contact, case, request, or firm ids"

requirements-completed: [PORT-01, PORT-02, PORT-03, PORT-04, PORT-05, PORT-06]

coverage:
  - id: D1
    description: "GET /api/c/state returns the allow-listed PortalState for the cookie link, steps ordered by position, no contact fields or ids; never marks opened"
    requirement: "PORT-01, PORT-03"
    verification:
      - kind: unit
        ref: "app/worker/test/client-portal.test.ts#GET /api/c/state; #db/portal getPortalState"
        status: pass
      - kind: smoke
        ref: "pnpm -C app run smoke:auth https://resspark.zh-a16.workers.dev --auth (ok auth /api/c portal)"
        status: pass
    human_judgment: false
  - id: D2
    description: "clientSession: cookie-only identity, uniform 401 no_session with privacy headers for every failure"
    requirement: "PORT-06"
    verification:
      - kind: unit
        ref: "app/worker/test/client-portal.test.ts#session failures are one uniform 401 (8 cases + byte-identical bodies)"
        status: pass
      - kind: smoke
        ref: "node app/scripts/smoke.mjs https://resspark.zh-a16.workers.dev (ok /api/c 401 no_session, ok /api/c start 401)"
        status: pass
    human_judgment: false
  - id: D3
    description: "POST /api/c/start is the only opener: header-gated, cookie link only, idempotent opened_at, link_inactive → 401"
    requirement: "PORT-02, PORT-04"
    verification:
      - kind: unit
        ref: "app/worker/test/client-portal.test.ts#POST /api/c/start; #opening is explicit"
        status: pass
      - kind: smoke
        ref: "smoke --auth: ok auth /api/c portal (state leaves opened_at null; two starts return one opened_at; row stamped)"
        status: pass
    human_judgment: false
  - id: D4
    description: "POST /api/c/heartbeat upserts client_sessions with 64/200 caps, UA enum, CSRF header, 10 per 60 s per link"
    requirement: "PORT-05"
    verification:
      - kind: unit
        ref: "app/worker/test/client-portal.test.ts#POST /api/c/heartbeat; #allowInWindow"
        status: pass
      - kind: smoke
        ref: "smoke --auth: ok auth /api/c portal (client_sessions row with last_step smoke)"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-10-11
status: complete
---

# Phase 2 Plan 07: Client Portal API Summary

**The client side now has its server half. `GET /api/c/state`, `POST /api/c/start`, and `POST /api/c/heartbeat` sit behind a `clientSession` middleware that takes identity only from Phase 1's signed `rs_client` cookie and re-checks the link on every call. Every failure is the same 401 `no_session`. POSTs need `X-Requested-With: ResSpark`, heartbeats are capped at 10 per minute per link, and every `/api/c/*` response is no-store, noindex, and no-referrer. All of this is deployed and proven live behind a real cookie.**

## Performance

- **Duration:** about 20 min
- **Started:** 2026-10-11T07:55:20Z
- **Completed:** 2026-10-11T08:15:49Z
- **Tasks:** 2, both TDD: RED commit, then GREEN commit. One extra smoke commit.
- **Files:** 8 created, 6 modified

## Accomplishments

- **`clientSession`** reads `rs_client` with `getSignedCookie` and the derived `cookieSecret`. It checks that the payload is JSON with a UUID `link_id` and a finite `exp` in the future. It then re-reads the link with `findClientLink` and rejects a missing, revoked, or expired link, or one without a request (a full timestamp compare). Every failure throws one `HTTPException(401, 'no_session')`. The query, params, and body are never read for identity.
- **`GET /api/c/state`** returns the allow-listed `PortalState`. It comes from one firm- and request-scoped query (`requests` + `firms!inner(name)` + `request_items`), with steps sorted by position and built field by field. A request deleted under the link returns the same 401.
- **`POST /api/c/start`** calls `request_open(p_link_id)` with the cookie's link only, ignoring posted ids. It returns `{ opened_at }`, and `link_inactive` becomes 401. It is the only code path that marks a request opened.
- **`POST /api/c/heartbeat`** checks `allowInWindow('hb:<link>', 10, 60_000)` first (the 11th call is 429 `rate_limited` and writes nothing). It then validates the body: an object, `last_step` ≤ 64 characters, `last_error` ≤ 200, `user_agent_class` one of phone, tablet, or desktop. It upserts `client_sessions` on `link_id` and returns `{ ok: true }`.
- **`index.ts`**: the inline `/c/*` header middleware became `clientPrivacyHeaders`, now applied to `/c/*` and `/api/c/*`. `secureHeaders` on `/api/*` already adds `Referrer-Policy: no-referrer`. The Phase 1 `client-link.test.ts` still passes, with no regression.
- **`link-rate-limit.ts`**: the window logic became the exported `allowInWindow`. `linkRateLimit` calls it with `link:<ip>`, 20, and 60 s, so its behavior is unchanged. The test checks that the 21st exchange from one IP is still 429.
- **Deployed** version `07dc1b69-587c-41d2-bfc7-9b9ca54800a6` at https://resspark.zh-a16.workers.dev. The unauthenticated smoke run was 10/10 `ok`, including `ok /api/c 401 no_session` and `ok /api/c start 401`. The `--auth` smoke run was 18/18 `ok`, including the new `ok auth /api/c portal`.
- The opened-link count (`client_links where opened_at is not null`) was `0` immediately before and `0` immediately after the unauthenticated smoke run. After the `--auth` run, it is still `0`, and the probe case has `0` requests left.

## Task Commits

1. **Task 1: cookie → clientSession → state → start (tracer)**: `efdc926` (test, RED), then `11bc8d2` (feat, GREEN). The tracer gate re-ran the verify command (34/34 passed): "Tracer verified end-to-end — expanding".
2. **Task 2: heartbeat, per-link window, smoke, redeploy**: `b0c57af` (test, RED), `dcac0e4` (feat, GREEN), then `405cca9` (test: the live `--auth` portal smoke).

The ledger range `3266702..405cca9` holds 10 commits. Five are this plan's. The other five are Plan 02-06's, which landed on the shared branch during the run.

## TDD Gate Compliance

| Task | Target test | RED classifier | Semantic assessment |
|------|-------------|----------------|---------------------|
| 1 | `client-portal.test.ts > GET /api/c/state > returns the allow-listed portal state for the cookie session` | RED_EVIDENCE_OK (target_test_failed) | It failed on `expect(res.status).toBe(200)` with 404, because the RED stub sub-app had `use('*', clientSession)` (a no-op stub) and no handlers. That is the intended reason. The full RED run had 20 failed and 14 passed, including all of `client-link.test.ts`. |
| 2 | `client-portal.test.ts > POST /api/c/heartbeat > limits each link to 10 heartbeats per 60 s; the 11th is 429 and writes nothing` | RED_EVIDENCE_OK (target_test_failed) | It failed on its first status assertion (404 vs 200), because no `/heartbeat` handler existed and `allowInWindow` was a stub returning `true`. That is the intended reason. 12 failed and 23 passed. The exchange-limit regression test passed in RED, as expected, since that behavior already existed. |

RED records were classified with `gsd_run check tdd-red-evidence` and kept outside the repo, so they were not committed.

## Decisions Made

See `key-decisions` in the frontmatter. The plan asked for three to be recorded:

- **CSRF header:** `X-Requested-With: ResSpark` on every `POST /api/c/*`, on top of the `SameSite=Lax` cookie. Plan 08's SPA must send it on start and heartbeat.
- **In-memory per-link window `shortcut:`:** `hb:<link id>`, 10 per 60 s, per isolate. The upgrade path is a Workers Rate Limiting binding keyed by link.
- **DTO allow-list:** `firm_name, agent_display_name, status, opened_at, expires_at, steps[id, position, kind, label, required, status]`. The tests assert the exact key sets and the absence of `email`, `phone`, `case_id`, `request_id`, `firm_id`, and the raw ids.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Verification] Live proof of state, start, and heartbeat behind a real cookie**
- **Found during:** Task 2
- **Issue:** The orchestrator's success criteria require all three routes proven live. The plan's smoke covered only the no-cookie 401s, and Plan 08's `--client-flow` does not exist yet.
- **Fix:** Extracted the probe seeding from `linkExchange` into `withProbeLink(body)`, so the two checks share it, and added `auth /api/c portal`. That check exchanges the probe token, then confirms: `GET /state` is 200 and leaves `opened_at` null; two `POST /start` calls return one `opened_at`, which is stamped on the row; and `POST /heartbeat` writes `client_sessions`. The probe request is deleted afterwards. The cookie is never printed.
- **Files:** `app/scripts/smoke.mjs`, `docs/app/scripts/smoke.md`
- **Commit:** `405cca9`

**2. [Rule 2 - Missing critical] Extra validation in `clientSession` and heartbeat**
- A link row with a null `request_id` is treated as no session. A non-UUID `link_id` and a non-finite `exp` are rejected before any lookup. The heartbeat rejects an array body and non-string fields with 400. Tests cover each case: 8 uniform-401 cases instead of the planned 5, and 5 bad-body cases.
- **Commit:** `11bc8d2`, `dcac0e4`

**3. [Kept existing behavior] `clientPrivacyHeaders` sets the headers after `next()`**
- The plan text says "before `next()`". The existing Phase 1 middleware sets them after `next()` on purpose: a raw asset `Response` drops headers prepared earlier. The extraction keeps that order. The tests confirm the headers on 200, 400, 401, 403, and 429 responses.

**Total deviations:** 2 auto-fixed (verification, validation) and 1 deliberate keep. **Impact:** no scope change, and every acceptance criterion passes.

## Issues Encountered

- `tsc -b` showed one error in Plan 02-05/06's `src/features/requests/request-link-actions.test.tsx`, a file this plan does not own. By the time of the pre-deploy `pnpm -C app run check`, the whole tree was green (684 passed, 52 skipped, eslint 0 errors), and the deploy ran after it.

## Known Stubs

None.

## Verification

- `pnpm -C app exec vitest run --project worker-node worker/test/client-portal.test.ts worker/test/client-link.test.ts worker/src/log/logger.test.ts`: 3 files, 50 passed (`client-portal.test.ts` has 35).
- `pnpm -C app run check`: exit 0.
- `bash app/scripts/hygiene-check.sh`: `hygiene ok`.
- `pnpm -C app run deploy`: version `07dc1b69-587c-41d2-bfc7-9b9ca54800a6`.
- `node app/scripts/smoke.mjs https://resspark.zh-a16.workers.dev`: 10/10 `ok`. `pnpm -C app run smoke:auth <url> --auth`: 18/18 `ok`.
- `db-migrate.mjs --query` opened-link count: `0` before and `0` after the smoke run.
- All acceptance greps for both tasks pass. `routes/client-link.ts` still has no `opened_at`.

## Next Phase Readiness

Plan 08 (SPA) can bind to the `<interfaces>` contract exactly as written. It must send `X-Requested-With: ResSpark` and `credentials: 'same-origin'` on the POSTs, treat any 401 as the "ask your agent for a new link" page, and back off on 429. `requirements.ready-ids` reports PORT-01..06 as not yet markable, because Plan 08 also declares them. They stay open until 02-08's SUMMARY exists.

## Self-Check: PASSED
