---
phase: 01-foundation-staff-sign-in
verified: 2026-10-11T09:55:00Z
status: human_needed
score: 11/13 must-haves verified
covered_files:
  - ".gitignore"
  - ".npmrc"
  - ".planning/phases/01-foundation-staff-sign-in/01-01-PLAN.md"
  - ".planning/phases/01-foundation-staff-sign-in/01-01-SUMMARY.md"
  - ".planning/phases/01-foundation-staff-sign-in/01-02-PLAN.md"
  - ".planning/phases/01-foundation-staff-sign-in/01-02-SUMMARY.md"
  - ".planning/phases/01-foundation-staff-sign-in/01-03-PLAN.md"
  - ".planning/phases/01-foundation-staff-sign-in/01-03-SUMMARY.md"
  - ".planning/phases/01-foundation-staff-sign-in/01-04-PLAN.md"
  - ".planning/phases/01-foundation-staff-sign-in/01-04-SUMMARY.md"
  - ".planning/phases/01-foundation-staff-sign-in/01-05-PLAN.md"
  - ".planning/phases/01-foundation-staff-sign-in/01-05-SUMMARY.md"
  - ".planning/phases/01-foundation-staff-sign-in/01-06-PLAN.md"
  - ".planning/phases/01-foundation-staff-sign-in/01-06-SUMMARY.md"
  - ".planning/phases/01-foundation-staff-sign-in/01-07-PLAN.md"
  - ".planning/phases/01-foundation-staff-sign-in/01-07-SUMMARY.md"
  - ".planning/phases/01-foundation-staff-sign-in/01-08-PLAN.md"
  - ".planning/phases/01-foundation-staff-sign-in/01-08-SUMMARY.md"
  - "app/package.json"
  - "app/scripts/check-file-sizes.mjs"
  - "app/scripts/db-migrate.mjs"
  - "app/scripts/hygiene-check.sh"
  - "app/scripts/smoke.mjs"
  - "app/src/features/auth/sign-in/components/user-auth-form.tsx"
  - "app/src/features/dashboard/index.tsx"
  - "app/src/features/layout/sandbox-banner.tsx"
  - "app/src/lib/api.ts"
  - "app/src/lib/session.ts"
  - "app/src/routes/admin/_shell/route.tsx"
  - "app/src/routes/admin/route.tsx"
  - "app/worker/src/auth/client-link.ts"
  - "app/worker/src/auth/staff-jwt.ts"
  - "app/worker/src/db/client.ts"
  - "app/worker/src/db/events.ts"
  - "app/worker/src/db/staff.ts"
  - "app/worker/src/index.ts"
  - "app/worker/src/integrations/logics/write-guard.ts"
  - "app/worker/src/log/logger.ts"
  - "app/worker/src/middleware/link-rate-limit.ts"
  - "app/worker/src/middleware/staff-auth.ts"
  - "app/worker/src/routes/admin-session.ts"
  - "app/worker/src/routes/client-link.ts"
  - "app/worker/src/routes/config.ts"
  - "app/worker/test/rls.test.ts"
  - "pnpm-workspace.yaml"
  - "supabase/config.toml"
  - "supabase/migrations/0002_platform_foundation.sql"
covered_digest: "v3:sha256:bf33050dae1cc7404b360e73634a21d1d45b2c222664a1c598368d0dd9d5e8ac"
behavior_unverified: 1
overrides_applied: 1
overrides:
  - must_have: "A fresh clone uses one package manager and one lockfile on Node 22.12 or newer"
    reason: "CONTEXT D-02: the one-lockfile rule applies to app/ (root pnpm-lock.yaml only); src/frontend/ is the frozen legacy frontend whose package-lock.json is deleted with the folder in Phase 7 (07-08). Not deleted now because the user has uncommitted edits there."
    accepted_by: "orchestrator (--auto run, per locked CONTEXT D-02; user may revoke)"
    accepted_at: "2026-10-11T10:05:00Z"
behavior_unverified_items:
  - truth: "Staff stay signed in after a browser refresh (PLAT-07)"
    test: "Sign in on https://resspark.zh-a16.workers.dev/admin/sign-in as zack@resspark.test, then reload /admin"
    expected: "The sidebar shell renders again with no redirect to /admin/sign-in; the profile menu still shows Zack and the email"
    why_human: "Persistence depends on supabase-js keeping the session in localStorage with auto-refresh. No test reloads a browser; guard.test.tsx mocks getSession()"
human_verification:
  - test: "Browser walkthrough on the deployed URL (01-06 human-check, merged with the 01-02 and 01-03 visual checks). Open https://resspark.zh-a16.workers.dev/admin/sign-in. Sign in as zack@resspark.test (password DEMO_STAFF_PASSWORD in app/.dev.vars). Reload the page. Open the profile menu. Choose Sign out and confirm. Then open /admin in a private window. Finally, narrow the window below 360 px on the sign-in page."
    expected: "The amber SANDBOX banner shows at the top of sign-in and of every /admin page, with no close control. After sign-in you land on /admin with the sidebar (Work > Dashboard, Account > Appearance) and the 'Nothing to do yet' card. After the reload you are still signed in. The profile menu shows 'Zack' and the email. Sign-out opens the 'Sign out of ResSpark?' dialog and returns you to sign-in. The private window redirects to /admin/sign-in?redirect=... . Below 360 px the banner copy wraps with no horizontal scroll. Also check the known issue that at about 420 px or narrower the banner may cover one line of the sticky header."
    why_human: "Visual layout, a real browser reload, and the redirect timing are not covered by any automated test. The session-refresh truth is listed as behavior-unverified."
  - test: "Client pages at phone size (01-07 human-check). Use a 320 px viewport at 200% zoom and open https://resspark.zh-a16.workers.dev/c/ and /c/not-a-valid-token."
    expected: "Each page is one column with no horizontal scroll and no text smaller than 16 px. The firm name is on one line. There is no sidebar, header chrome or theme toggle. The browser tab title is the firm name. /c/not-a-valid-token shows 'This link isn't active'."
    why_human: "Responsive layout and zoom behaviour cannot be checked by grep or the jsdom tests."
  - test: "Decision on the SC5 'one lockfile' wording. src/frontend/package-lock.json (npm, legacy frozen frontend) is still tracked next to the root pnpm-lock.yaml."
    expected: "Either (a) accept CONTEXT D-02, which scopes the one-lockfile rule to app/ and deletes the legacy lockfile in Phase 7, by adding the override below to this file's frontmatter, or (b) delete src/frontend/package-lock.json now"
    why_human: "The roadmap wording is literally unmet, while a locked discuss-phase decision (D-02) deliberately scoped it. Only the user can say which one wins."
---

# Phase 1: Foundation & Staff Sign-In Verification Report

**Phase Goal:** As a ValorTax case manager, I want to sign in to ResSpark at a real public URL on a secure, sandbox-safe base, so that every later feature ships on a deployed foundation where no data is reachable without auth and nothing can write to the real Logics tenant by accident.
**Verified:** 2026-10-11T09:55:00Z
**Status:** human_needed
**Re-verification:** No. This is the first verification.
**Mode:** mvp. The goal is in user-story format (`user-story.validate` returned valid).

## User Flow Coverage

User story: «As a ValorTax case manager, I want to sign in to ResSpark at a real public URL on a secure, sandbox-safe base, so that every later feature ships on a deployed foundation where no data is reachable without auth and nothing can write to the real Logics tenant by accident.»

| Step | Expected | Evidence | Status |
|------|----------|----------|--------|
| Open the public URL | `/admin` serves the SPA from the Worker | `smoke.mjs` run by the verifier: `ok /admin`, `ok /api/config`, `ok /webhooks 404 json`, `ok /api 404 json`, plus three `/c/` checks (7/7, exit 0) | ✓ |
| See it is sandbox | The SANDBOX banner shows on sign-in and on every /admin page | `routes/admin/route.tsx` mounts `<SandboxBanner/>` above `<Outlet/>`. The deployed `/api/config` returns `app_env: sandbox`. The banner is in the deployed `route-*.js` chunk. `sandbox-banner.test.tsx` (4 cases) passes | ✓ (visual: human) |
| Sign in | Email and password through Supabase Auth, and a `staff.signed_in` event is written | `user-auth-form.tsx:67` `signInWithPassword`, then `:88` POST `{event:'signed_in'}`. The live DB has 15 `staff.signed_in` rows, all with `actor_type=staff` and an actor id | ✓ |
| Land in the shell | Sidebar plus the empty dashboard | `_shell/route.tsx` renders `AuthenticatedLayout`. `sidebar-data.ts` has Work/Dashboard and Account/Appearance. `dashboard/index.tsx` has the Inbox icon and "Nothing to do yet" | ✓ (visual: human) |
| Refresh | Still signed in | Relies on supabase-js localStorage persistence. No test reloads a browser | ⚠️ human |
| Outcome: no data without auth | Anon and unauthenticated callers are refused everywhere | Deployed `GET /api/admin/session` with no token returns 401 `unauthorized`. `test:rls` passed 27/27 (all 25 public tables return 401/42501, and both RPCs are refused). Anon `GET /rest/v1/events` returns 401. Every table has RLS on and no anon or authenticated grants (live catalog query) | ✓ |
| Outcome: no accidental Logics writes | Writes are refused unless the flag is on and the case id is allowlisted | `logicsWriteGuard` with 6 passing tests. Deployed `logics_write_enabled: false`. The committed `wrangler.jsonc` has `LOGICS_TEST_CASE_IDS: ""`. The only Logics client call is a GET | ✓ |

## Goal Achievement

### Observable Truths

These are the roadmap success criteria, split into atomic truths. All plan `must_haves` truths are covered by them, and `verify.artifacts` and `verify.key-links` pass for all 8 plans.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Anyone can open the public Cloudflare URL, and one deploy serves the SPA, `/api/*` and `/webhooks/*` (PLAT-01) | ✓ VERIFIED | `smoke.mjs` 7/7. curl returned `/api/config` JSON and `/webhooks/x` 404. `wrangler.jsonc` has `run_worker_first` for /api, /webhooks and /c |
| 2 | Staff sign in with Supabase Auth (PLAT-07) | ✓ VERIFIED | The form calls `signInWithPassword`. Two seeded users exist with `app_metadata` claims that match `staff_profiles` (live query). Live `/auth/v1/settings` reports `disable_signup: true`. `staffAuth` verifies ES256 against JWKS and checks iss/aud; `auth.test.ts` (11 cases) passes |
| 3 | Staff stay signed in after a refresh (PLAT-07) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | supabase-js persistence is the mechanism, and `_shell` `beforeLoad` reads `getSession()`. No test performs a reload. See Human Verification 1 |
| 4 | A visitor who is not signed in cannot load any `/admin/*` page or read any data (PLAT-07) | ✓ VERIFIED | `guard.test.tsx` passes: no session redirects to `/admin/sign-in?redirect=`. The deployed API returns 401 without a token. Anon is refused on all 25 tables. Note that the SPA HTML shell is public by design, the guard is client-side, and data is gated by the Worker |
| 5 | A signed-in staff member lands in the admin shell (sidebar and empty dashboard) under a visible SANDBOX banner (PLAT-05) | ✓ VERIFIED | Route composition and component content were confirmed. The banner is fail-safe (shown while pending, on error and in sandbox) and passes 4 tests. Visual confirmation is part of Human Verification 1 |
| 6 | With `LOGICS_WRITE_ENABLED` off, a write to any CaseID outside the allowlist is refused in code (PLAT-05) | ✓ VERIFIED | `write-guard.ts` uses exact trimmed matching and requires the flag to be exactly `'true'`. `write-guard.test.ts` passes 6/6 (flag off, empty list, prefix, `TRUE`, no leak). Deployed flag is false |
| 7 | An automated test proves the anon role gets zero rows from every table (PLAT-02) | ✓ VERIFIED | The verifier ran `pnpm -C app run test:rls`: 27/27 passed. Its `TABLES` list (25) matches the live `pg_class` list for public exactly. Each table has `rls=true` and `has_table_privilege(anon/authenticated, SELECT)=false` |
| 8 | The browser bundle holds no secret (PLAT-03) | ✓ VERIFIED | `hygiene-check.sh` gate (h) passed. The verifier downloaded 38 deployed JS chunks: no `sb_secret_[A-Za-z0-9_-]{16,}`, and only `sb_publishable_` in `supabase-*.js`. Worker secrets are names only: SUPABASE_URL, SUPABASE_SECRET_KEY, CLIENT_LINK_HMAC_KEY |
| 9 | Every change goes through the Worker, not directly to Postgres (PLAT-03) | ✓ VERIFIED | The SPA has no `supabase.from/rpc/storage` calls, only `auth.*`. Grants are revoked, so a direct write is impossible (migration 0002 lines 124-136) |
| 10 | Sign-in and sign-out each write an event row with actor, timestamp and id, through the shared event path (PLAT-04) | ✓ VERIFIED | `admin-session.ts` POST calls `logEvent`, which calls `rpc('log_event')`. That is the only writer; the 0003 RPCs also `PERFORM log_event`. `events` columns are `id bigint`, `actor_id`, `created_at NOT NULL`. Live rows: `staff.signed_in` 15 and `staff.signed_out` 3, all with an actor. `auth.test.ts` "POST signed_in writes staff.signed_in through logEvent" passes |
| 11 | A fresh clone ignores every `.env` file and tracks no `dist/` (PLAT-06) | ✓ VERIFIED | `.gitignore` has `.env`, `.env.*`, `!.env.example`, `dist/`, `.dev.vars*`. `git ls-files` lists no `.env`, `.dev.vars` or `dist/` path. `hygiene-check.sh` returned `hygiene ok` |
| 12 | One package manager and one lockfile on Node >= 22.12 (PLAT-06) | ? UNCERTAIN | Engines `>=22.12` with `engine-strict=true` and `packageManager pnpm@10.32.1` are correct. However, `git ls-files` shows two lockfiles: `pnpm-lock.yaml` and the legacy `src/frontend/package-lock.json` (npm). CONTEXT D-02 deliberately scopes the rule to `app/`. This needs a human decision (Human Verification 3) |
| 13 | A failed request's log line holds no tokens, document bytes or PII (PLAT-08) | ✓ VERIFIED | The logger is the only `console.log` in `worker/src`. It allowlists 8 keys and logs the route pattern, not the path. `logger.test.ts` "logs /c/:token for a failing client link without the token or the ip" passes. `invocation_logs: false` |

**Score:** 11/13 truths verified (1 present but behavior-unverified, 1 uncertain and pending a decision)

### Suggested override for truth 12

**This looks intentional.** To accept D-02's scoping, add this to the frontmatter:

```yaml
overrides:
  - must_have: "A fresh clone uses one package manager and one lockfile on Node 22.12 or newer"
    reason: "CONTEXT D-02: the one-lockfile rule applies to app/ (root pnpm-lock.yaml only); src/frontend/ is the frozen legacy frontend whose package-lock.json is deleted with the folder in Phase 7"
    accepted_by: "{your name}"
    accepted_at: "{ISO timestamp}"
```

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| 8 plans' `must_haves.artifacts` (50 total) | exist, substantive | ✓ VERIFIED | `verify.artifacts`: 7/7, 8/8, 7/7, 5/5, 7/7, 6/6, 6/6, 4/4 |
| `app/worker/src/index.ts` | Hono app, error envelope, 404 JSON, /c headers | ✓ VERIFIED | Mounts config, admin-session and /c routes. `onError` never serialises `err.message` |
| `supabase/migrations/0002_platform_foundation.sql` | tables, RLS, revokes, `log_event`, append-only trigger | ✓ VERIFIED | Applied live (`--status` lists 0002 and 0003) |
| `app/scripts/hygiene-check.sh`, `check-file-sizes.mjs` | PLAT-06 gate | ✓ VERIFIED | `hygiene ok`. The size gate is part of `check` |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| 8 plans' `must_haves.key_links` (25 total) | | | ✓ WIRED. `verify.key-links` returned all verified for every plan |
| `user-auth-form.tsx` | `/api/admin/session` | POST `signed_in` after `signInWithPassword` | ✓ WIRED |
| `sign-out-dialog.tsx` and the 401 handler in `main.tsx` | `signOutEverywhere` | POST `signed_out`, then local `signOut` | ✓ WIRED |
| `admin-session.ts` | `log_event()` | `logEvent` → `admin.rpc` | ✓ WIRED |
| `routes/admin/route.tsx` | `/api/config` | `SandboxBanner` uses `api()` and `isConfig` | ✓ WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `SandboxBanner` | `data.app_env` | Worker `GET /api/config`, which returns `c.env.APP_ENV` | Yes. Deployed value is `sandbox` | ✓ FLOWING |
| `nav-user` / `profile-dropdown` | `display_name`, `email` | `GET /api/admin/session`, which reads `staff_profiles` | Yes. The live profiles are "Zack" and "Andrew (case manager)" | ✓ FLOWING |
| Dashboard | (none) | A static empty state by design in Phase 1 | n/a | ✓ (intentional) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Unit, lint, size and golden gate | `pnpm -C app run check` | exit 0. 25 files passed and 5 env-gated files skipped; 451 tests passed and 52 skipped. 0 ESLint errors and 1 warning | ✓ PASS |
| Deployed URL | `node app/scripts/smoke.mjs https://resspark.zh-a16.workers.dev` | 7/7 ok | ✓ PASS |
| Migrations applied | `node app/scripts/db-migrate.mjs --status` | `0002_platform_foundation`, `0003_requests` | ✓ PASS |
| Anon is denied on every table (live) | `pnpm -C app run test:rls` | 27/27 passed | ✓ PASS |
| Unauthenticated admin API | `curl /api/admin/session` (GET and POST) | 401 `{"error":{"code":"unauthorized"}}` | ✓ PASS |
| Sign-up disabled (live) | `GET <supabase>/auth/v1/settings` using the deployed bundle's public URL and key | `disable_signup: true` | ✓ PASS |
| Hygiene and bundle secret gate | `bash app/scripts/hygiene-check.sh` | `hygiene ok` | ✓ PASS |
| Session events persisted | Read-only `select` on `public.events` | signed_in 15, signed_out 3, each with an actor | ✓ PASS |

`test:live` and `smoke:auth` were not run because they write rows to the live database. The SUMMARY claims for them (69/69 and 11/11) are supported by the persisted event rows above.

### Probe Execution

Step 7c: SKIPPED. The phase declares no `scripts/*/tests/probe-*.sh` probes. The spike scripts under `spikes/` are one-off live-resource scripts, not probes, and were not re-run because they create Storage buckets.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PLAT-01 | 01-03, 01-08 | Public Workers URL serves the SPA, /api and /webhooks from one deploy | ✓ SATISFIED | Truth 1 |
| PLAT-02 | 01-04 | RLS deny-by-default, with an automated anon test | ✓ SATISFIED | Truth 7 |
| PLAT-03 | 01-05, 01-08 | No browser secret, all mutations through the Worker, credentials only as Worker secrets | ✓ SATISFIED | Truths 8 and 9 |
| PLAT-04 | 01-04, 01-05, 01-06 | Actions write event rows with actor, timestamp and id | ✓ SATISFIED (Phase 1 scope: sign-in and sign-out) | Truth 10 |
| PLAT-05 | 01-03 | Write flag, allowlist and SANDBOX banner | ✓ SATISFIED | Truths 5 and 6 |
| PLAT-06 | 01-01, 01-02 | .gitignore, no dist, engines, one package manager and one lockfile | ? NEEDS HUMAN (lockfile wording) | Truths 11 and 12 |
| PLAT-07 | 01-02, 01-05, 01-06, 01-07 | Sign in, persist across refresh, unauthenticated users blocked | ? NEEDS HUMAN (refresh) | Truths 2, 3 and 4 |
| PLAT-08 | 01-03, 01-07 | Logs hold no tokens, bytes or PII | ✓ SATISFIED | Truth 13 |

No orphaned requirements. REQUIREMENTS.md maps exactly PLAT-01 to PLAT-08 to Phase 1, and every one is claimed by a plan.

### Decision Coverage

All 23 trackable CONTEXT.md decisions are honored by shipped artifacts (`check.decision-coverage-verify`: honored 23/23, not_honored []).

### Test Quality Audit

| Test File | Linked Req | Skipped | Circular | Assertion Level | Verdict |
|-----------|-----------|---------|----------|-----------------|---------|
| `worker/test/rls.test.ts` | PLAT-02 | env-gated only (ran live: 27/27) | No | Value (401 plus code 42501) | ✓ |
| `worker/src/integrations/logics/write-guard.test.ts` | PLAT-05 | 0 | No | Behavioral | ✓ |
| `src/features/layout/sandbox-banner.test.tsx` | PLAT-05 | 0 | No | Behavioral (4 states) | ✓ |
| `worker/src/log/logger.test.ts` | PLAT-08 | 0 | No | Value (exact keys, absence of token and IP) | ✓ |
| `worker/test/auth.test.ts` | PLAT-04, PLAT-07 | 0 | No | Status plus behavioral (mocked `logEvent` call) | ✓ |
| `src/routes/admin/guard.test.tsx` | PLAT-07 | 0 | No | Behavioral (redirect) | ✓ |
| `worker/test/session.test.ts`, `events.test.ts`, `signup-disabled.test.ts` | PLAT-04, PLAT-07 | env-gated (`describe.skipIf`), not run here | No | Value | ✓ (live rows corroborate) |

Disabled tests on requirements: 0 (the skips are env gates, not `.skip`). Circular patterns: 0. Insufficient assertions: 0.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (Phase 1 files under app/, supabase/, docs/app/) | n/a | TBD, FIXME, XXX, TODO, placeholder | none found | none |
| `app/src/routes/__root.tsx` | 15 | ESLint `react-refresh/only-export-components` warning | ℹ️ Info | Affects hot reload only |
| `app/worker/test/rls.test.ts` | 20-46 | Hard-coded `TABLES` list; only the baseline schema count is guarded, so a new migration table that is not added to the list would go untested | ℹ️ Info | The list matches the 25 live tables today. Consider deriving it from `pg_class` |
| `.planning/phases/01-foundation-staff-sign-in/01-VALIDATION.md` | frontmatter | Still `status: draft`, `nyquist_compliant: false`, all rows pending | ℹ️ Info | Bookkeeping only; run `/gsd-validate-phase 1` |
| WINDOWS #5 | n/a | `pnpm -C app dev` still needs `app/.env` for local sign-in | ℹ️ Info | Local dev only. Deploy and the live suites use the `../src/frontend/.env` script path |
| In-progress Phase 2 change (uncommitted) to `app/wrangler.jsonc` | `secrets.required` | Adds `INTEGRATION_ENC_KEY`, which is not set on the Worker (the secret list shows 3 names) | ℹ️ Info (Phase 2) | The next deploy fails until that secret is put. Not a Phase 1 defect |

### Human Verification Required

### 1. Deployed sign-in walkthrough (01-06, with the 01-02 and 01-03 visual checks)

**Test:** Open https://resspark.zh-a16.workers.dev/admin/sign-in and sign in as `zack@resspark.test` (the password is `DEMO_STAFF_PASSWORD` in `app/.dev.vars`). Reload the page, open the profile menu, then choose Sign out and confirm. Open `/admin` in a private window. Narrow the sign-in page below 360 px.
**Expected:**
- The SANDBOX banner is on every page.
- After sign-in you see the sidebar shell with the "Nothing to do yet" dashboard.
- You are still signed in after the reload.
- The profile menu shows "Zack" and the email.
- Sign-out shows the dialog and lands on sign-in.
- The private window redirects to `/admin/sign-in?redirect=…`.
- The banner wraps with no horizontal scroll. Also look for the known overlap of about one line with the sticky header at 420 px or narrower.

**Why human:** This covers visual layout and a real reload (refresh persistence is behavior-unverified).

### 2. Client pages at 320 px and 200 % zoom (01-07)

**Test:** Open `/c/` and `/c/not-a-valid-token` on the deployed URL at 320 px width and 200 % zoom.
**Expected:**
- Each page is one column with no horizontal scroll and no text under 16 px.
- The firm name is on one line.
- There is no admin chrome.
- The tab title is the firm name.

**Why human:** Responsive and zoom layout is not testable in jsdom.

### 3. Decide the "one lockfile" wording (SC5 / PLAT-06)

**Test:** Choose between accepting the D-02 scoping (add the override above) and deleting `src/frontend/package-lock.json` now.
**Expected:** Either the override is recorded or the legacy lockfile is gone.
**Why human:** The roadmap text conflicts with a locked discuss-phase decision.

### Gaps Summary

No blocking gaps. All 8 plans' artifacts and key links verify. The deployed Worker passes unauthenticated smoke. The live RLS proof passes 27/27 and matches the live table list exactly. Session events are persisted with actor, id and timestamp. The Logics write guard refuses everything with the deployed config. The bundle is free of secrets.

The phase is held at `human_needed` for three reasons:
- the browser walkthrough, which includes the unproven refresh persistence;
- the `/c/` responsive check;
- a decision on whether the legacy npm lockfile breaks SC5's "one lockfile", or whether D-02's scoping is accepted as an override.

---

_Verified: 2026-10-11T09:55:00Z_
_Verifier: Claude (gsd-verifier)_
