---
phase: "01"
slug: "foundation-staff-sign-in"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-10"
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.3 with `projects`: `web` (jsdom, `src/**/*.test.{ts,tsx}`), `worker-node` (node, `worker/**/*.test.ts` — Worker handlers via Hono `app.request()` with an env object, independent of spike (a)), and optional `workerd` (`@cloudflare/vitest-plugin` 1.4.0, kept only if spike (a) passes in Plan 03) |
| **Config file** | none yet — Plan 02 Task 1 creates `app/vitest.config.ts` (web + worker-node); Plan 03 Task 2 may add `app/worker/vitest.config.ts` (workerd) |
| **Quick run command** | `pnpm -C app test` (= `vitest run --project web --project worker-node`) |
| **Full suite command** | `pnpm -C app check` (size gate + `tsc -b` + eslint + `pnpm test`), `pnpm -C app test:live` (`dotenv -e .env -e .dev.vars -- vitest run --project worker-node worker/test` — rls, signup-disabled, events, session against the live project), and `python -m unittest discover -s src/tests -v` (Python oracle, unchanged) |
| **Estimated runtime** | ~30 seconds (unit); live suite ~20 s more |

---

## Sampling Rate

- **After every task commit:** Run `pnpm -C app test` and `node app/scripts/check-file-sizes.mjs`
- **After every plan wave:** Run `pnpm -C app build && bash app/scripts/hygiene-check.sh && pnpm -C app check` and `python -m unittest discover -s src/tests -v`
- **Before `/gsd-verify-work`:** Full suite green, `pnpm -C app test:live` green against the live Supabase project, and `node app/scripts/smoke.mjs <url>` plus `--auth` green against the deployed URL
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-T1 | 01 | 1 | PLAT-06 | T-01-01 | `.env*`/`.dev.vars*`/`dist/`/`.wrangler/` ignored, examples kept; engines enforced; 500/501 boundary | script | `bash app/scripts/hygiene-check.sh` | ❌ W0 | ⬜ pending |
| 01-01-T2 | 01 | 1 | PLAT-06 | T-01-01 | README records secret names only | source assertion | `test -f docs/app/README.md && grep -q dotenv-cli docs/app/README.md && grep -q "Legacy: frozen" src/frontend/README.md` | ❌ W0 | ⬜ pending |
| 01-02-T1 | 02 | 2 | PLAT-06, PLAT-07 | T-01-04, T-01-05, T-01-SC | Clerk/axios/faker/recharts stripped; exact pins | build + unit + grep | `pnpm -C app build && pnpm -C app test && ! grep -rEil 'clerk\|axios\|faker\|recharts' app/src` | ❌ W0 | ⬜ pending |
| 01-02-T2 | 02 | 2 | PLAT-07 | — | no webfont / third-party fetch in the shell | build + grep | `pnpm -C app build && ! grep -rE 'fonts\.googleapis' app/index.html app/src` | ❌ W0 | ⬜ pending |
| 01-03-T1 | 03 | 3 | PLAT-01, PLAT-08 | T-01-08, T-01-12, T-01-13 | invocation logs off; 404 JSON for `/api/*`,`/webhooks/*`; one deploy | smoke (deployed) | `node app/scripts/smoke.mjs <url>` | ❌ W0 | ⬜ pending |
| 01-03-T2 | 03 | 3 | PLAT-05, PLAT-08 | T-01-09, T-01-11 | exact allowlisted log keys; guard throws unless flag+allowlist | unit | `pnpm -C app vitest run --project worker-node worker/src/log/logger.test.ts worker/src/integrations/logics/write-guard.test.ts worker/test/config.test.ts` | ❌ W0 | ⬜ pending |
| 01-03-T3 | 03 | 3 | PLAT-05 | T-01-11 | banner fail-safe (pending/failed/sandbox → shown); api type guards | component + unit | `pnpm -C app vitest run --project web src/lib/api.test.ts src/features/layout/sandbox-banner.test.tsx` | ❌ W0 | ⬜ pending |
| 01-04-T1 | 04 | 3 | PLAT-02, PLAT-04 | T-01-14, T-01-15, T-01-16, T-01-17 | REVOKE + ALTER DEFAULT PRIVILEGES; SECURITY INVOKER; append-only trigger; idempotent runner | live query (schema gate) | `node app/scripts/db-migrate.mjs && node app/scripts/db-migrate.mjs --dry-run \| grep -q '^0 pending'` | ❌ W0 | ⬜ pending |
| 01-04-T2 | 04 | 3 | PLAT-02 | T-01-14, T-01-15 | anon → 401/42501 on all 20 tables; `log_event` not callable | integration (live) | `pnpm -C app exec dotenv -e .env -- vitest run --project worker-node worker/test/rls.test.ts` | ❌ W0 | ⬜ pending |
| 01-05-T1 | 05 | 4 | PLAT-03 | T-01-19, T-01-20, T-01-21, T-01-23 | secrets over stdin, never printed; bundle secret-free; `app_metadata` only; HMAC key never rotated | unit + build + script | `pnpm -C app vitest run --project worker-node worker/src/db/client.test.ts && pnpm -C app build && bash app/scripts/hygiene-check.sh` | ❌ W0 | ⬜ pending |
| 01-05-T2 | 05 | 4 | PLAT-07 | T-01-22 | public sign-up refused; password sign-in works | integration (live) | `pnpm -C app exec dotenv -e .env -e .dev.vars -- vitest run --project worker-node worker/test/signup-disabled.test.ts` | ❌ W0 | ⬜ pending |
| 01-05-T3 | 05 | 4 | PLAT-04 | T-01-17 | `logEvent` → `log_event()`; distinct rows; UPDATE/DELETE raise | integration (live) | `pnpm -C app exec dotenv -e .env -e .dev.vars -- vitest run --project worker-node worker/test/events.test.ts` | ❌ W0 | ⬜ pending |
| 01-06-T1 | 06 | 5 | PLAT-04, PLAT-07 | T-01-25, T-01-26, T-01-30 | JWKS ES256 verify; firm cross-check 403; 400 on bad `event`; body ids ignored | unit + integration (live) | `pnpm -C app vitest run --project worker-node worker/test/auth.test.ts && pnpm -C app exec dotenv -e .env -e .dev.vars -- vitest run --project worker-node worker/test/session.test.ts` | ❌ W0 | ⬜ pending |
| 01-06-T2 | 06 | 5 | PLAT-07 | T-01-28 | `_shell` beforeLoad redirect; `safeRedirect` rejects off-site targets | component | `pnpm -C app vitest run --project web src/routes/admin/guard.test.tsx` | ❌ W0 | ⬜ pending |
| 01-06-T3 | 06 | 5 | PLAT-04, PLAT-07 | T-01-27, T-01-29 | 401 → local sign-out + redirect; deployed token round-trip | smoke (deployed, auth) | `pnpm -C app exec dotenv -e .env -e .dev.vars -- node scripts/smoke.mjs <url> --auth` | ❌ W0 | ⬜ pending |
| 01-07-T1 | 07 | 6 | PLAT-08 | T-01-31, T-01-33, T-01-34, T-01-35, T-01-37 | HMAC verify constant-time; uniform 404; signed HttpOnly cookie; no `opened_at` write | unit | `pnpm -C app vitest run --project worker-node worker/src/auth/client-link.test.ts worker/test/client-link.test.ts` | ❌ W0 | ⬜ pending |
| 01-07-T2 | 07 | 6 | PLAT-08 | T-01-31, T-01-32, T-01-36 | per-IP rate limit → 429; `/c/:token` log line holds no token/IP; privacy headers on `/c/*` | unit + smoke (deployed) | `pnpm -C app vitest run --project worker-node worker/src/log/logger.test.ts worker/test/client-link.test.ts && node app/scripts/smoke.mjs <url>` | ❌ W0 | ⬜ pending |
| 01-07-T3 | 07 | 6 | PLAT-07 | — | client shell free of admin bundle; no layout import; ≥16 px text | component + build grep | `pnpm -C app vitest run --project web src/features/client-link/no-link-page.test.tsx && pnpm -C app build` | ❌ W0 | ⬜ pending |
| 01-08-T1 | 08 | 5 | PLAT-03 | T-01-38 | spike bucket + objects deleted; no key leaked into `.planning/` | script + grep | `grep -qE '^Result: (PASS\|FAIL)' .planning/phases/01-foundation-staff-sign-in/01-SPIKES.md && grep -q 'buckets after cleanup: 0' .planning/phases/01-foundation-staff-sign-in/01-SPIKES.md` | ❌ W0 | ⬜ pending |
| 01-08-T2 | 08 | 5 | PLAT-01, PLAT-03 | T-01-39 | reserved secret names only; no values in README/SPIKES | grep | `grep -q 'decision: no-change' .planning/phases/01-foundation-staff-sign-in/01-SPIKES.md && grep -q RESEND_API_KEY app/.dev.vars.example` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Requirement → test map (updated by the planner to the final project names and commands)

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLAT-01 | Public URL serves the SPA, `/api/config`, and a Worker-rendered 404 for `/webhooks/*` from one deploy | smoke (post-deploy) | `node app/scripts/smoke.mjs <url>` (URL recorded in `docs/app/README.md` by Plan 03; checks `/admin` → 200, `/api/config` → JSON with `app_env`, `/webhooks/x` → 404 JSON, `/api/nope` → 404 JSON, later `/c/` checks) | ❌ Wave 0 (Plan 03 T1) |
| PLAT-02 | anon returns 401/`42501` on every one of the 20 public tables (strict — `200 []` is NOT accepted because an empty table with leaked grants would pass) | integration (live) | `pnpm -C app exec dotenv -e .env -- vitest run --project worker-node worker/test/rls.test.ts` | ❌ Wave 0 (Plan 04 T2) |
| PLAT-03 | SPA bundle contains no `sb_secret_`; `secrets.required` declared; admin client fail-fast; secrets provisioned over stdin | static + unit | `pnpm -C app build && bash app/scripts/hygiene-check.sh` (bundle grep inside) and `pnpm -C app vitest run --project worker-node worker/src/db/client.test.ts` | ❌ Wave 0 (Plan 05 T1) |
| PLAT-04 | `POST /api/admin/session` writes `staff.signed_in` / `staff.signed_out` through `log_event()`; events append-only | integration (live) | `pnpm -C app exec dotenv -e .env -e .dev.vars -- vitest run --project worker-node worker/test/session.test.ts worker/test/events.test.ts` | ❌ Wave 0 (Plan 05 T3, Plan 06 T1) |
| PLAT-05 | `logicsWriteGuard` throws unless flag on and id allowlisted; banner when `APP_ENV !== production` (fail-safe) | unit + component | `pnpm -C app vitest run --project worker-node worker/src/integrations/logics/write-guard.test.ts && pnpm -C app vitest run --project web src/features/layout/sandbox-banner.test.tsx` | ❌ Wave 0 (Plan 03 T2/T3) |
| PLAT-06 | `.gitignore` entries, no tracked dist, engines, one lockfile, 500-line gate (500/501 boundary) | script | `bash app/scripts/hygiene-check.sh` | ❌ Wave 0 (Plan 01 T1) |
| PLAT-07 | Sign-in persists across refresh; `/admin/*` redirects without session; API 401 without token / 403 unknown staff; sign-up disabled | component + unit + integration | `pnpm -C app vitest run --project web src/routes/admin/guard.test.tsx && pnpm -C app vitest run --project worker-node worker/test/auth.test.ts` and `pnpm -C app exec dotenv -e .env -e .dev.vars -- vitest run --project worker-node worker/test/signup-disabled.test.ts` | ❌ Wave 0 (Plan 05 T2, Plan 06 T1/T2) |
| PLAT-08 | Log line for a failing `/c/<token>` request contains no token; only allowlisted keys; invocation logs off | unit + config | `pnpm -C app vitest run --project worker-node worker/src/log/logger.test.ts` and `grep -q '"invocation_logs": false' app/wrangler.jsonc` | ❌ Wave 0 (Plan 03 T2, Plan 07 T2) |

---

## Wave 0 Requirements

- [ ] `app/vitest.config.ts` (`web` + `worker-node`) — Plan 02 T1; `app/worker/vitest.config.ts` (`workerd`) only if spike (a) passes — Plan 03 T2
- [ ] `app/worker/test/rls.test.ts` — PLAT-02 (Plan 04 T2)
- [ ] `app/worker/test/auth.test.ts`, `app/worker/test/session.test.ts` (Plan 06 T1), `app/worker/test/events.test.ts`, `app/worker/test/signup-disabled.test.ts` (Plan 05), `app/worker/test/client-link.test.ts` + `app/worker/src/auth/client-link.test.ts` (Plan 07 T1) — PLAT-04, PLAT-07, token primitives
- [ ] `app/worker/src/log/logger.test.ts`, `app/worker/src/integrations/logics/write-guard.test.ts`, `app/worker/test/config.test.ts` (Plan 03 T2), `app/worker/src/db/client.test.ts` (Plan 05 T1) — PLAT-08, PLAT-05, PLAT-03
- [ ] `app/src/lib/api.test.ts`, `app/src/features/layout/sandbox-banner.test.tsx` (Plan 03 T3), `app/src/routes/admin/guard.test.tsx` (Plan 06 T2), `app/src/features/client-link/no-link-page.test.tsx` (Plan 07 T3)
- [ ] `app/scripts/check-file-sizes.mjs`, `app/scripts/hygiene-check.sh` (Plan 01 T1), `app/scripts/smoke.mjs` (Plan 03 T1) — PLAT-06, PLAT-01
- [ ] Framework install (Plan 02 T1, pinned): `vitest@5.0.3`, `@cloudflare/vitest-plugin@1.4.0`, `jsdom@30.1.2`, `dotenv-cli@11.0.0`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Staff sees the SANDBOX banner and the empty admin shell after sign-in on the deployed URL | PLAT-05, PLAT-07 | Visual confirmation on the real deploy | Open `https://resspark.<sub>.workers.dev/admin`, sign in with the seeded demo user, confirm the banner text "SANDBOX" is visible above the sidebar, refresh, confirm still signed in |
| `wrangler secret put` for `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `CLIENT_LINK_HMAC_KEY` | PLAT-03 | Secrets are provisioned by a human or a script that never prints values | Run the secrets script; confirm `wrangler secret list` shows the three names |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
