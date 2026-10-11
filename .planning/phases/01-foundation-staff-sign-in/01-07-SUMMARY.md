---
phase: 01-foundation-staff-sign-in
plan: 07
subsystem: auth
tags: [hono, webcrypto, hmac, signed-cookie, rate-limiting, cloudflare-workers, tanstack-router, react, vitest]

requires:
  - phase: 01-foundation-staff-sign-in
    provides: "Worker app with /c/* headers middleware and SPA fallback (01-03), allowlist logger with routePath(c,-1) (01-03), createAdminClient (01-04), client_links table + CLIENT_LINK_HMAC_KEY secret (01-04/01-05), deploy and smoke:auth scripts (01-05/01-06)"
  - phase: 02-find-the-client-send-the-link
    provides: "migration 0003: client_links.request_id NOT NULL + FK, request_create/request_send RPCs used by the deployed exchange smoke"
provides:
  - "D-17 link tokens: mintLinkToken / verifyLinkToken (base64url(link_id || HMAC(link_id || be32(version))), 64 chars)"
  - "GET /c/:token exchange: valid -> signed rs_client cookie (HttpOnly, Secure, Lax, 24h) -> 302 /c/; every failure -> one static 404 page"
  - "linkRateLimit: per-ip 20/60s via the LINK_RATE_LIMITER binding (accepted on deploy) with an in-memory fallback"
  - "PLAT-08 proof: a failing /c/<token> logs one allowlisted line with route /c/:token, no token, no ip"
  - "findClientLink / createClientLink data access"
  - "S5 ClientShell plus /c/ placeholder and /c/$token fallback, code-split from the admin shell"
  - "smoke.mjs /c/ checks and an --auth deployed link-exchange proof"
affects: [02-find-the-client-send-the-link, client-portal, phase-2-client-screens, PLAT-08]

actuals:
  tokens: 19900
  tasks: 3
  commits: 8

tech-stack:
  added: []
  patterns:
    - "Link-as-credential exchange: Worker-first GET /c/:token -> signed HttpOnly cookie -> 302 to a token-free URL"
    - "Uniform failure: verifyLinkToken returns null for every failure; the route serves one prebuilt static page"
    - "Derived key separation: cookie MAC key = SHA-256(secret + ':cookie'), never the link MAC key"
    - "Client pages: ClientShell only, no @/components/layout import, text-base minimum"
    - "Deployed proofs that need a real row seed it through RPCs and delete it in finally"

key-files:
  created:
    - app/worker/src/auth/client-link.ts
    - app/worker/src/auth/client-link.test.ts
    - app/worker/src/db/client-links.ts
    - app/worker/src/routes/client-link.ts
    - app/worker/src/routes/client-link-pages.ts
    - app/worker/src/middleware/link-rate-limit.ts
    - app/worker/test/client-link.test.ts
    - app/src/features/client-link/client-shell.tsx
    - app/src/features/client-link/no-link-page.tsx
    - app/src/features/client-link/invalid-link-page.tsx
    - app/src/features/client-link/no-link-page.test.tsx
    - app/src/routes/c/index.tsx
    - app/src/routes/c/$token.tsx
  modified:
    - app/worker/src/index.ts
    - app/worker/src/log/logger.test.ts
    - app/wrangler.jsonc
    - app/worker-configuration.d.ts
    - app/scripts/smoke.mjs
    - app/src/routes/__root.tsx
    - app/src/routeTree.gen.ts

key-decisions:
  - "Rate limiting: binding active. Wrangler accepted the ratelimits block (LINK_RATE_LIMITER 20/60s) on deploy, so assumption A-1 held; the in-memory window remains only as the fallback for tests and local runs"
  - "Toaster position: one root Toaster (RootToaster in __root.tsx) set to top-center on /c and /c/*, top-right on admin, instead of a second Toaster in the shell"
  - "HMAC key material is the UTF-8 bytes of CLIENT_LINK_HMAC_KEY (a 64-hex string); the smoke mints tokens the same way"
  - "verifyLinkToken checks the exact 64-char base64url shape before decoding, because Node's decoder ignores junk characters"
  - "createClientLink requires request_id (migration 0003 made it NOT NULL with an FK)"
  - "The deployed 302 proof lives in smoke --auth: it seeds a probe request on the fixed requests-live fixture case, exchanges the token, asserts opened_at stays null, and deletes the request"

patterns-established:
  - "Client-link cookie contract: rs_client = signed JSON { link_id, exp }, read with getSignedCookie(c, await cookieSecret(env.CLIENT_LINK_HMAC_KEY), 'rs_client')"
  - "Worker-served HTML pages are prebuilt constants with no interpolation"

requirements-completed: [PLAT-08, PLAT-07]

coverage:
  - id: D1
    description: "HMAC link tokens: mint/verify, version binding, tamper/length/unknown/revoked/expired rejection, derived cookie secret"
    requirement: PLAT-07
    verification:
      - kind: unit
        ref: "app/worker/src/auth/client-link.test.ts (11 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "GET /c/:token -> signed HttpOnly rs_client cookie -> 302 /c/, privacy headers, no DB write; identical 404 for every failure"
    requirement: PLAT-07
    verification:
      - kind: integration
        ref: "app/worker/test/client-link.test.ts (12 tests incl. rate limiting)"
        status: pass
      - kind: e2e
        ref: "pnpm -C app run smoke:auth https://resspark.zh-a16.workers.dev --auth -> ok auth /c/ exchange, ok /c/ 404 html, ok /c/ headers"
        status: pass
    human_judgment: false
  - id: D3
    description: "Per-ip rate limit on /c/:token (binding + in-memory fallback), 429 page before lookup"
    requirement: PLAT-07
    verification:
      - kind: integration
        ref: "app/worker/test/client-link.test.ts#GET /c/:token rate limiting"
        status: pass
    human_judgment: false
  - id: D4
    description: "PLAT-08: failing /c/<token> logs one allowlisted line, route /c/:token, without the token or the ip; invocation logs off"
    requirement: PLAT-08
    verification:
      - kind: unit
        ref: "app/worker/src/log/logger.test.ts#logs /c/:token for a failing client link without the token or the ip"
        status: pass
    human_judgment: false
  - id: D5
    description: "S5 client shell with /c/ placeholder and /c/$token fallback; no admin chrome; tab title and robots meta; client chunks free of the sidebar"
    verification:
      - kind: unit
        ref: "app/src/features/client-link/no-link-page.test.tsx (5 tests)"
        status: pass
      - kind: other
        ref: "pnpm -C app build; chunks with the client copy (_token-CWb3jb1R.js, c-ClXfdl6o.js) import only client-shell, card, jsx-runtime and inbox; SidebarProvider appears only in search-provider-Ku7_YRh7.js"
        status: pass
      - kind: e2e
        ref: "smoke: ok /c/ spa on version 74898a97"
        status: pass
    human_judgment: false
  - id: D6
    description: "Client pages at 320 px width and 200 % zoom: no horizontal scroll, no text below 16 px, firm name on one line"
    verification: []
    human_judgment: true
    rationale: "Visual layout check on a phone-sized viewport; the plan holds it out as an end-of-phase manual check (UI Considerations: client pages long-text backstop)"

duration: 30min
completed: 2026-10-11
status: complete
plan_head_before: e8de0bc375e5bb1d04244bd30f967359c88b3de1
plan_head_after: c981ccdde562721317912c71bc466c06b49c07de
---

# Phase 1 Plan 07: Client-Link Exchange and Client Shell Summary

**Clients now enter through `GET /c/<64-char HMAC token>`. A valid token gets a signed HttpOnly `rs_client` cookie and a 302 to `/c/`, and this is proven on the deployed Worker. Every invalid token gets the same static 404. Requests are rate-limited per IP by the Cloudflare Rate Limiting binding. A logger test proves no token or IP reaches the logs. `/c/` renders the one-column S5 client shell without loading any of the admin bundle.**

## Performance

- **Duration:** 30 min
- **Started:** 2026-10-11T06:05:31Z
- **Completed:** 2026-10-11T06:35:50Z
- **Tasks:** 3
- **Files modified:** 39 (code, tests, docs, generated types and route tree)

## Accomplishments

- D-17 token primitives (`auth/client-link.ts`): `crypto.subtle.verify` gives a constant-time MAC check. The token's shape and length are checked before any database lookup, and every failure returns `null`.
- D-18 exchange (`routes/client-link.ts`). The cookie holds only `{ link_id, exp }` and is signed with a derived key. The redirect target is always `/c/`. Nothing writes `opened_at`; the live DB shows `n: 0` after two deployed exchanges.
- **A-1 outcome: rate limiting uses the binding.** The `LINK_RATE_LIMITER` binding (20 requests per 60 s) was accepted on deploy (versions `0547fa5f` and `74898a97`). The in-memory window in `middleware/link-rate-limit.ts` (with its `shortcut:` comment) is only the fallback.
- PLAT-08: the logger test sends a failing `/c/<token>` request and gets exactly one line. Its keys match the allowlist, `route` is `/c/:token`, and the line contains neither the token nor `198.51.100.7`.
- SPA: `ClientShell` (480 px column, `truncate` firm name, `line-clamp-2` agent line, tab title set to the firm name, robots noindex), `NoLinkPage` on `/c/`, and `InvalidLinkPage` on `/c/$token`. The invalid-link copy matches the Worker's 404 word for word.
- **Toaster choice:** one root `RootToaster`, `top-center` on `/c` and `/c/*`, `top-right` on admin pages.
- **Code-split proof:** after `pnpm -C app build`, the chunks that contain the client copy are `_token-CWb3jb1R.js` and `c-ClXfdl6o.js`. They import only `client-shell-BmxYSwgJ.js`, `card-DX28-jHl.js`, `jsx-runtime-DWSWI4JT.js` and `inbox-f5MTBmIT.js`. `SidebarProvider` appears only in `search-provider-Ku7_YRh7.js`. ("Nothing to do yet" also appears in `_shell-Daktipn6.js`, but that is the admin dashboard's own empty state, not client code.)
- Deployed smoke, all 11 checks passing: `ok /c/ 404 html`, `ok /c/ headers`, `ok /c/ spa`, and `ok auth /c/ exchange` (302, cookie attributes, no token in the cookie, privacy headers, `opened_at` still null).

## Task Commits

1. **Task 1: GET /c/:token end-to-end (tracer)**: `6e8f941` (test, RED), `5b34b21` (feat, GREEN). The tracer gate re-ran verify in auto mode (21/21) before expanding.
2. **Task 2: rate limit, PLAT-08 logger proof, deploy, smoke**: `f3adf26` (test, RED), `c48945b` (feat, GREEN; deployed `0547fa5f`).
3. **Task 3: SPA client shell**: `4331d9e` (test, RED; its evidence was rejected, see deviations), `acb5c5e` (test, valid RED), `c981ccd` (feat, GREEN; deployed `74898a97`).

`commits: 8` is measured from `plan_head_before` to `plan_head_after` and includes one orchestrator commit that landed on `zack` mid-run (`03c7c3a docs(08): plan-checker revisions`). This plan made 7 of the 8.

RED evidence: `01-07-RED-EVIDENCE.json`, `01-07-RED-EVIDENCE-task2.json`, `01-07-RED-EVIDENCE-task3.json`, all `RED_EVIDENCE_OK`.

## Files Created/Modified

- `app/worker/src/auth/client-link.ts`: token mint/verify, cookie secret, uuid helpers
- `app/worker/src/db/client-links.ts`: `findClientLink`, `createClientLink`
- `app/worker/src/routes/client-link.ts`: the `/c/:token` exchange
- `app/worker/src/routes/client-link-pages.ts`: static 404 and 429 pages (UI-SPEC S7)
- `app/worker/src/middleware/link-rate-limit.ts`: per-IP limit with the binding and an in-memory fallback
- `app/worker/src/index.ts`: `app.route('/c', clientLinkRoute)`
- `app/wrangler.jsonc`, `app/worker-configuration.d.ts`: `ratelimits` block and the regenerated `Env`
- `app/scripts/smoke.mjs`: `/c/` checks and the `--auth` deployed exchange
- `app/src/features/client-link/*`, `app/src/routes/c/*`, `app/src/routes/__root.tsx`, `app/src/routeTree.gen.ts`: client shell, pages, routes, Toaster
- Tests: `auth/client-link.test.ts`, `test/client-link.test.ts`, `log/logger.test.ts` (PLAT-08 case), `no-link-page.test.tsx`
- Docs: companions for every new or changed code file under `docs/app/...`. `__root.tsx` moved out of `docs/app/src/VENDORED.md` into its own doc, and `wrangler.md`, `smoke.md`, `logger.md` and `index.md` were updated.

## Decisions Made

See `key-decisions` in the frontmatter. The two the plan asked to record: **rate limiting: binding active**, and **Toaster: one root Toaster keyed off the pathname**.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `createClientLink` requires `request_id`**
- **Found during:** Task 1
- **Issue:** The planned interface had an optional `request_id`, but migration 0003 (Plan 02-01) made `client_links.request_id` `NOT NULL` with an FK.
- **Fix:** `request_id: string` is required. The deployed smoke seeds links through the 0003 RPCs instead of a direct insert.
- **Committed in:** `5b34b21`

**2. [Rule 2 - Missing critical] Exact token-shape check before decoding**
- **Found during:** Task 1
- **Issue:** `Buffer.from(token, 'base64url')` skips invalid characters, so a valid token with junk appended would still verify.
- **Fix:** `/^[A-Za-z0-9_-]{64}$/` runs before decoding. The `raw.length !== 48` check stays.
- **Committed in:** `5b34b21`

**3. [Rule 2 - Missing critical] Deployed proof of the 302 exchange**
- **Found during:** Task 2
- **Issue:** The plan's smoke checks only failures, but the plan's success criteria require the cookie-and-302 path proven on the deployed URL.
- **Fix:** Added the `auth /c/ exchange` check to `smoke.mjs`, run under `--auth` via `smoke:auth`. It cleans up after itself; the DB has `client_links` = 0 and `n: 0` opened afterward.
- **Committed in:** `c48945b`

**4. [Rule 1 - Bug] Task 3 RED commit landed before its evidence validated**
- **Found during:** Task 3
- **Issue:** I chained the commit after the classifier without gating on its verdict. `4331d9e` was committed while the evidence read `INVALID_RED (invalid_record)`: Vitest's TAP output escaped the apostrophe in "isn't" inside a failure message, which made the TAP malformed. No GREEN code had been written.
- **Fix:** The apostrophe-free sentence is now asserted first, and the stubs render a placeholder. No assertion changed. The rerun gave `RED_EVIDENCE_OK` and was committed as `acb5c5e` before any implementation. A similar multi-line `toEqual` report in Task 1 was caught before its commit by asserting on `?.id`.
- **Committed in:** `acb5c5e`

**5. [Rule 3 - Blocking] `__root.tsx` hook placement**
- **Found during:** Task 3
- **Issue:** Calling `useRouterState` inside the route's anonymous `component` violates `react-hooks/rules-of-hooks`.
- **Fix:** Added a named `RootToaster` component. ESLint now gives one warning (`react-refresh/only-export-components`), which affects hot reload only. The file left `VENDORED.md` and got its own doc.
- **Committed in:** `c981ccd`

---

**Total deviations:** 5 auto-fixed (1 bug, 2 missing-critical, 2 blocking). **Impact:** correctness and security only, no scope creep. The admin Toaster also moved from Sonner's default bottom-right to the UI-SPEC's top-right.

## TDD Gate Compliance

Each task has a `test(01-07)` RED commit before its `feat(01-07)` GREEN commit. The validated RED for Task 3 is `acb5c5e` (see deviation 4). No refactor commits.

## Issues Encountered

- Bash heredocs containing apostrophes were split by the tool harness twice. Files were written with the Write/Edit tools instead.
- `tsc -b` failed on the new file routes until `vite build` regenerated `routeTree.gen.ts`, which is committed.

## User Setup Required

None. The binding needed no account change.

## Next Phase Readiness

- Phase 2 can read `rs_client` with `getSignedCookie(c, await cookieSecret(env.CLIENT_LINK_HMAC_KEY), 'rs_client')`, mint links with `mintLinkToken(await hmacKey(...), uuidToBytes(link.link_id), link.version)` after `request_send` or `request_regenerate_link`, and build client screens inside `ClientShell`.
- Still open: the end-of-phase human check at 320 px width and 200 % zoom for `/c/` and `/c/not-a-valid-token` (recorded in `.planning/WINDOWS.md` as unrun-verify).
- `app/scripts/smoke.mjs` is 201 lines; Plan 02-03 edits it next. The Plan 07 block is marked `// --- Plan 07: client-link checks (/c/*) ---`.

## Self-Check: PASSED

- All 13 created code files exist on disk, along with `docs/app/worker/src/middleware/link-rate-limit.md`.
- Commits `6e8f941`, `5b34b21`, `f3adf26`, `c48945b`, `4331d9e`, `acb5c5e` and `c981ccd` are ancestors of HEAD.
- `pnpm -C app run check`: file sizes, `tsc -b`, ESLint (0 errors) and 181 tests passed. Smoke `--auth` passed 11/11 on version `74898a97`, and `opened_at is not null` returns `n: 0`.

---
*Phase: 01-foundation-staff-sign-in*
*Completed: 2026-10-11*
