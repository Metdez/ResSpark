# Session handoff — 2026-10-11 16:10 EDT

Branch `zack` (pushed to `origin/zack` and `origin/main`). Phases 1–7 are built, verified and deployed. Phase 8 is planned and checked but **not started**: it adds migrations to the live project and waits for the reply "approve phase 8 migrations".

Live: https://resspark.zh-a16.workers.dev, deployed from commit `4219f2b` (Worker version `73f9b33b`) with `pnpm -C app run deploy:snapshot`. Smoke: 14 ok. `LOGICS_MODE=fake`, `LOGICS_WRITE_ENABLED=false`. Migrations 0002–0009 are applied.

## Phase status

| Phase | Plans | Verification |
|---|---|---|
| 1 Foundation & staff sign-in | 8/8 | human_needed (lockfile override accepted) |
| 2 Find the client & send the link | 8/8 | human_needed |
| 3 Uploads, review & live status | 7/7 | human_needed 6/7 |
| 4 Connect payroll & bank | 7/7 | human_needed 7/10 |
| 5 Push to Logics | 5/5 | human_needed 8/8 (SC1 override per D-10) |
| 6 Address & e-sign | 8/8 | human_needed 7/8 (SIGN-02 proven live, 11/11) |
| 7 433-A pre-population | 12/12 | human_needed 66/71, no blocking gaps; the 9 live suites then passed (39/39) |
| 8 Reminders & readiness | 0/12 | gated on "approve phase 8 migrations" |

"human_needed" means the code and automated checks pass, and what is left is browser, phone or people review (listed below).

## How to resume

1. Phase 8: after the approval reply, run `/gsd-execute-phase 8`. Dispatch on the main tree (worktrees have no `app/.dev.vars`). Run `gsd-tools query dispatch-isolation --raw --phase 08 --plan 08-NN --force-isolation none` right before each executor dispatch.
2. Executor prompts carry:
   - the project-root pin guard (a unique `pin-<plan>.sh`);
   - path-limited commits (`git add <paths> && git commit -m "…" -- <paths>`);
   - the shared-file protocol for `app/worker/src/index.ts`, `jobs/index.ts`, `app/package.json`, `app/wrangler.jsonc`, `rls.test.ts`, `smoke.mjs`, `request-page.tsx` and `step-list.tsx`;
   - "never name env files in Bash";
   - "executors do not deploy".
3. Deploy with `pnpm -C app run deploy:snapshot`. It builds the last commit in a clean worktree, so uncommitted work never ships. Then run `node app/scripts/smoke.mjs <url>`, `pnpm -C app run smoke:connect <url>` and `pnpm -C app run smoke:esign <url>`.

## Before the demo (Mon Oct 12, 11:30)

- Provider keys via `pnpm -C app run secrets:provider`: Plaid, Truv, DocuSeal, Smarty. Until then, those steps run on stubs or report `not_configured`.
- **Logics reads are LIVE** (2026-10-11, user request): `LOGICS_MODE=live`, writes still off (`LOGICS_WRITE_ENABLED=false`). Firm "za" holds the tested key; the ValorTax demo firm has no key, so its lookups say "Logics is not configured" until a key is saved and tested there. The client was fixed for the real tenant (query-string params, capitalized `Data`/`Success`, Find 404 = no match).
- **Email = Cloudflare Email Service** (replaced Resend 2026-10-11). Send now emails the client automatically. `EMAIL_FROM=notifications@resspark.com` is deployed. Done 2026-10-12: `resspark.com` is registered on the Cloudflare account and onboarded for Email Sending (all six DNS records, status `ready`); a test send from `notifications@resspark.com` was accepted. No redeploy was needed.
- To show a real push: enter the Logics key and secret in Settings → Integrations, click Test connection, and turn on "Write enabled". Keep `LOGICS_MODE=fake` unless Andrew has given a write key and test CaseIDs.
- Run each step on a real phone: link → intake → bank → payroll → address → upload → sign.

## Waiting on the user / ValorTax

- **Andrew:** Logics write key and scopes, test CaseIDs, `FileCategoryID` (documents and the 433-A worksheet), `ActivityType`, the unknown-CaseID response, phone format, and the disclaimer wording.
- **Nicole and Sandra:** layout review of the admin case view, the 433-A view and the worksheet PDF.
- **CPA/EA:** review `plaid_category_map` and `truv_deduction_map`, plus three real-shaped cases.
- **Counsel:** consent and e-sign wording.
- **Decisions:**
  - Should a request with some items approved read "In progress" instead of "Opened"? (Locked D-06 says Opened.)
  - Should the evaluation keep blocking on NULLs, or zero-fill like Python `_screenable`?
  - Keep or remove `src/frontend/`. The Vercel deployment on main still serves it.
  - Fix "32 questions" → 28 in `CLAUDE.md` and `.claude/CLAUDE.md`.
- **Browser and phone checks** for Phases 1–7 are listed under "Human Verification Required" in each `NN-VERIFICATION.md`.

## Notes from this session

- The origin/main merge is fully absorbed. The 433-A TypeScript engine was re-ported against the merged Python oracle and matches all 165 golden cases. `app/scripts/db-migrate.mjs` applies only `NNNN_*.sql`, so the timestamped Supabase CLI migrations from main are never run.
- Flaky tests fixed:
  - pdf-lib metadata timestamps caused a real hash mismatch (`aeb6b7c`).
  - The DocuSeal webhook clock (`6461e5f`).
  - `waitFor` timeouts in the request builder and request page.
- The shared git index can sweep another executor's staged files into your commit. Always commit with `-- <paths>`, and wait for `.git/index.lock` to clear first.
