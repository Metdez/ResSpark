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
| **Framework** | Vitest 5.0.3 with `projects`: `web` (jsdom) and `worker` (`@cloudflare/vitest-plugin` 1.4.0; falls back to Hono `app.request()` under the `web` project if spike (a) fails) |
| **Config file** | none — Wave 0 installs `app/vitest.config.ts` (and `app/worker/vitest.config.ts` if the Workers plugin is used) |
| **Quick run command** | `pnpm -C app vitest run --project web` |
| **Full suite command** | `pnpm -C app check` (file-size gate + `tsc -b` + eslint + `vitest run`) and `python -m unittest discover -s src/tests -v` (Python oracle, unchanged) |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm -C app vitest run --project web` and `node app/scripts/check-file-sizes.mjs`
- **After every plan wave:** Run `pnpm -C app check` and `python -m unittest discover -s src/tests -v`
- **Before `/gsd-verify-work`:** Full suite green, `worker/test/rls.test.ts` green against the live Supabase project, and `app/scripts/smoke.mjs` green against the deployed URL
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (filled by the planner from the PLAN.md task list) | | | PLAT-01..08 | | | | | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Requirement → test map (from RESEARCH.md § Validation Architecture)

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLAT-01 | Public URL serves the SPA, `/api/config`, and a Worker-rendered 404 for `/webhooks/*` from one deploy | smoke (post-deploy) | `node app/scripts/smoke.mjs https://resspark.<sub>.workers.dev` (checks `/admin` → 200, `/api/config` → JSON with `app_env`, `/webhooks/x` → 404 JSON) | ❌ Wave 0 |
| PLAT-02 | anon returns 0 rows or 401 on every public table | integration (live) | `npx -y dotenv-cli -e app/.env -- pnpm -C app vitest run --project web worker/test/rls.test.ts` | ❌ Wave 0 |
| PLAT-03 | SPA bundle contains no `sb_secret_`; Worker secrets declared | static | `grep -r "sb_secret_" app/dist/client && exit 1 \|\| true` plus `secrets.required` in `wrangler.jsonc` | ❌ Wave 0 |
| PLAT-04 | `POST /api/admin/session` writes `staff.signed_in` / `staff.signed_out` events | integration | `vitest run --project worker worker/test/session.test.ts` | ❌ Wave 0 |
| PLAT-05 | `logicsWriteGuard` throws unless flag on and id allowlisted; banner when `APP_ENV !== production` | unit + component | `vitest run --project web worker/src/integrations/logics/write-guard.test.ts src/features/layout/sandbox-banner.test.tsx` | ❌ Wave 0 |
| PLAT-06 | `.gitignore` entries, no tracked dist, engines, one lockfile, 500-line gate | script | `bash app/scripts/hygiene-check.sh` | ❌ Wave 0 |
| PLAT-07 | Sign-in persists across refresh; `/admin/*` redirects without session; API 401 without token | component + integration | `vitest run --project web src/routes/admin/guard.test.tsx` and `vitest run --project worker worker/test/auth.test.ts` | ❌ Wave 0 |
| PLAT-08 | Log line for a failing `/c/<token>` request contains no token; only allowlisted keys | unit | `vitest run --project web worker/src/log/logger.test.ts` | ❌ Wave 0 |

---

## Wave 0 Requirements

- [ ] `app/vitest.config.ts` (+ `app/worker/vitest.config.ts` if the Workers plugin is used) — projects split; spike (a) decides
- [ ] `app/worker/test/rls.test.ts` — PLAT-02
- [ ] `app/worker/test/auth.test.ts`, `app/worker/test/session.test.ts`, `app/worker/test/client-link.test.ts` — PLAT-04, PLAT-07, token primitives
- [ ] `app/worker/src/log/logger.test.ts`, `app/worker/src/integrations/logics/write-guard.test.ts` — PLAT-08, PLAT-05
- [ ] `app/scripts/check-file-sizes.mjs`, `app/scripts/hygiene-check.sh`, `app/scripts/smoke.mjs` — PLAT-06, PLAT-01
- [ ] Framework install: `pnpm -C app add -D vitest@5.0.3 @cloudflare/vitest-plugin@1.4.0 jsdom@30.1.2`

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
