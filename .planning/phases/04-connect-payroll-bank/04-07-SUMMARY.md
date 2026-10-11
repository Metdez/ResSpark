---
phase: 04-connect-payroll-bank
plan: 07
subsystem: ops
status: complete
tags: [smoke, runbooks, plaid, truv, csp]
requires: [04-05, 04-06]
provides: ["smoke.mjs --connect-flow (smoke-connect.mjs)", "pnpm smoke:connect", "README Demo script (Phase 4)", "runbooks/truv-webhook-endpoint.md", "runbooks/plaid-sandbox-rehearsal.md"]
affects: [app/worker/src/routes/c-return.ts]
key-files:
  created: [app/scripts/smoke-connect.mjs, docs/app/scripts/smoke-connect.md, docs/app/runbooks/truv-webhook-endpoint.md, docs/app/runbooks/plaid-sandbox-rehearsal.md]
  modified: [app/scripts/smoke.mjs, app/package.json, app/worker/src/routes/c-return.ts, app/worker/src/routes/c-return.test.ts, docs/app/scripts/smoke.md, docs/app/worker/src/routes/c-return.md, docs/app/worker/src/routes/c-return.test.md, docs/app/README.md]
decisions:
  - "--connect-flow lives in app/scripts/smoke-connect.mjs; smoke.mjs would pass 500 lines otherwise"
  - "The smoke reads the consent text_version from src/lib/consent-text.ts so a wording bump never breaks it"
  - "GET /c/return clones the ASSETS response (like the index.ts SPA fallback) so clientCsp can set headers"
requirements-completed: [WEBH-01, WEBH-02, PAY-01, PAY-04, BANK-01, BANK-05]
metrics:
  completed: 2026-10-11
actuals:
  tokens: 8500
  tasks: 2
  commits: 3
  commits_range_total: 14
plan_head_before: e7922775b8fe0f7ce5a5ca1d836aa889d9f4dd5d
plan_head_after: e8b9a4faa4156d0dca6be6e6374d0e7b36832d34
---

# Phase 4 Plan 07: Connect-flow smoke, demo script and runbooks Summary

**A `--connect-flow` smoke covers consent, both start routes (503 without keys, 200 with keys), `/c/return`, and the staff list, and prints only ids and codes. The smoke exposed a deployed `GET /c/return` 500, which is now fixed. The README has the Phase 4 demo script and final user actions, and two operator runbooks were added.**

`commits_range_total` is 14 because other executors committed on the shared `zack` branch in the same window. This plan made 3 of those commits.

## Commits

- `027f455` feat: `smoke-connect.mjs` + `--connect-flow` wiring in `smoke.mjs`, client-flow step count, `/c/return` fix + regression test, docs
- `52f0fcd` docs: README Demo script (Phase 4), final USER ACTION REQUIRED (Phase 4), two runbooks
- `e8b9a4f` chore: `smoke:connect` package script (committed after 06-06's `@docuseal/react` hunk in the same file landed)

## Results

- **Deployed URL:** https://resspark.zh-a16.workers.dev (not redeployed by this plan; the orchestrator deploys).
- **Vendor secrets (names only):** `CLIENT_LINK_HMAC_KEY`, `INTEGRATION_ENC_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_URL`, `TOKEN_ENC_KEY_1`. There are no `PLAID_*` or `TRUV_*` secrets, so the run is in no-keys mode.
- **Plain smoke (current deploy):** 13 ok and 0 FAIL, including `ok webhooks truv 401`, `ok webhooks unknown 404`, and `ok admin connections 401`.
- **`pnpm -C app smoke:connect` (current deploy):** every client-flow step passed, then `payroll provider configured: no`, `bank provider configured: no`, `consents`, `payroll start 503 (no keys)`, `bank start 503 (no keys)`, and `return 302`. It then failed with `FAIL connect-flow return csp: status 500`. That is the bug fixed in `027f455`, which is not deployed yet.
- **Pending for the orchestrator (post-deploy):** run `pnpm -C app smoke:connect https://resspark.zh-a16.workers.dev`. Expect `ok connect-flow return csp`, `ok connect-flow admin connections 0`, and `ok connect-flow complete (keys: payroll no, bank no)`.
- **`pnpm -C app run check`:** exit 0. 140 files passed and 29 skipped; 1721 tests passed and 218 skipped. Lint had 0 errors and 7 warnings (none in this plan's files). The size gate passed.
- **`pnpm -C app run test:live`:**
  - The default parallel run had 25 failures. Almost all were `Test timed out in 5000ms` while four executors loaded Supabase at once.
  - A serial rerun (`--no-file-parallelism --test-timeout=30000 --hook-timeout=60000`) passed 385 of 388 tests in 36 of 37 files.
  - The 3 remaining failures are in `worker/test/client-link.test.ts` (D-17 signing-link step and DocuSeal CSP). They come from 06-06's uncommitted work in `client-link.ts`, `client-csp.ts` and `client-link.test.ts`, not from this plan.
  - The plan's literal gate (default `test:live` exits 0) is therefore not met on this shared tree.
- **Rehearsal runbook:** `blocked-pending-user: no vendor keys`. The Observed and Pass columns are blank.

## Deviations from Plan

1. **[Rule 1 - Bug] `GET /c/return` answered 500 on the deployed Worker.** `c-return.ts` returned `c.env.ASSETS.fetch(...)` as-is. ASSETS responses have immutable headers, and `clientCsp` and the privacy middleware set headers after `next()`, so the request threw. The fix copies the response with `new Response(res.body, res)`, the same as the `index.ts` notFound SPA fallback. A new unit test uses spied `headers.set/append/delete` that throw; it fails on the old code with 500 and passes now. Fixed in `027f455`.
2. **[Rule 3 - Blocking] `--client-flow` expected 5 steps.** Migration 0008 (Phase 7) added an `intake` item to the Standard resolution packet, so the template now has 6. The check now compares against `template.items.length`. Fixed in `027f455`.
3. **[CLAUDE.md 500-line rule] New module `app/scripts/smoke-connect.mjs`** (98 lines) holds the connect steps; `smoke.mjs` is at 478 lines. Because of this, the plan's per-file greps for `/api/c/consents`, `provider_not_configured`, `/c/return?nonce=` and `content-security-policy` match `smoke-connect.mjs`, not `smoke.mjs`. The privacy grep is empty for both files.
4. **No deploy** (coordinator rule). The post-deploy smoke run is recorded above as pending.
5. **No-keys check is strict.** `connectFlow` expects 503 exactly when `provider.configured` is false and 200 exactly when it is true. The admin connection count must equal the number of starts that returned 200.

## USER ACTION still open (carried to the demo / Phase 8)

- Add Sandbox keys: `pnpm -C app secrets:provider plaid` and `pnpm -C app secrets:provider truv`.
- In the Plaid Dashboard: add the redirect URI `https://resspark.zh-a16.workers.dev/c/return`, create the Link customization with the use-case wording, and check Statements access.
- In the Truv Dashboard: register the Sandbox webhook (`task-status-updated` and `order-status-updated`), set order expiry to at least 14 days, and optionally create a template and set `TRUV_TEMPLATE_ID`.
- Run `docs/app/runbooks/plaid-sandbox-rehearsal.md`. It records the real `SESSION_FINISHED`, the two Truv employers, and the 320 px / 200 % layout check.
- Before Phase 8: keep Sandbox keys only; Production keys wait for the go-live review.
- In `truv-webhook-endpoint.md`, the `PATCH` body field (`status: enabled`) is not verified against Truv's reference. The runbook says to use the Dashboard if in doubt.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: app/scripts/smoke-connect.mjs, docs/app/scripts/smoke-connect.md, docs/app/runbooks/truv-webhook-endpoint.md, docs/app/runbooks/plaid-sandbox-rehearsal.md
- FOUND commits: 027f455, 52f0fcd, e8b9a4f (ancestors of HEAD)
