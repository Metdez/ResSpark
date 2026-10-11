# Session handoff — 2026-10-11 09:10 EDT

Branch `zack`, HEAD `e455a74`. Working tree clean except the user's own pre-existing edits (`.planning/config.json`, `src/document_parse.py`, `src/tests/test_document_parse.py`, `AGENTS.md`, `.env.example`, `src/frontend/package*.json`). Full check green: `pnpm -C app run check` → 1018 passed, 137 skipped (one known load-sensitive flake, `request-builder.test.tsx`, passed on rerun).

Live: https://resspark.zh-a16.workers.dev (Worker version `3b407e92`, `LOGICS_MODE=fake`, `LOGICS_WRITE_ENABLED=false`). Migrations 0002–0006 applied.

## Plan status

| Phase | Done | Next to run | Notes |
|---|---|---|---|
| 1 Foundation | 8/8 | — | Verification `human_needed` (browser checks) |
| 2 Find client & send link | 8/8 | — | Verification `human_needed`; expired-link fix landed in `38492b4` |
| 3 Uploads, review, status | 6/7 | **03-05** (depends 03-03 ✓) | then phase verification |
| 4 Connect payroll & bank | 2/7 | **04-03** (depends 04-01 ✓, 04-02 ✓) | longest chain before the demo: 04-03 → 04-04 → 04-05 ‖ 04-06 → 04-07 |
| 5 Push to Logics | 2/5 | **05-03 and 05-04** (depend 05-01 ✓, 05-02 ✓) | then 05-05 |
| 6 Address & e-sign | 0/8 | after Phases 4–5 | planned and checked |
| 7 433-A | 1/12 | 07-02 after Phase 6 migration 0007 | engine port 07-01 merged |
| 8 Reminders & readiness | 0/12 | after the demo (gated) | planned and checked |

Ready to run in parallel next session: **03-05, 04-03, 05-03, 05-04** (check file overlap first; use the shared-file protocol).

## How to resume

1. `/gsd-execute-phase` style dispatch on the main tree (worktrees have no `app/.dev.vars`): for each plan run `gsd-tools query dispatch-isolation --raw --phase NN --plan NN-NN --force-isolation none` immediately before its `gsd-executor` dispatch (one sentinel per dispatch).
2. Executor prompts carry: project-root pin guard (unique `pin-<plan>.sh`), `git add <paths> && git commit -m "…" -- <paths>`, shared-file protocol for `app/worker/src/index.ts`, `app/worker/src/jobs/index.ts`, `app/package.json`, `app/wrangler.jsonc`, `app/worker/test/rls.test.ts`, deploy once at the end on a green full check, never route around a blocked deploy, never name env files in Bash, commit each task as soon as it is done.
3. Handoff details for 04-03/04-04 are in `04-02-SUMMARY.md` ("Before 04-03 and 04-04 run").

## Waiting on the user / ValorTax

- Browser checks for Phases 1–3 (sign-in walkthrough, client screens at 320 px / 200 % zoom, staff lookup → send → copy, upload on a real phone, review approve/reject, dashboard).
- Resend API key + verified domain (`RESEND_FROM`) — email link reports `not_configured` until then.
- Truv and Plaid sandbox keys via `pnpm -C app run secrets:provider` — Phase 4 runs on stubs until then.
- Logics API key + secret in Settings → Integrations, Test connection, then `LOGICS_MODE=live`.
- Andrew: key scopes, `FileCategoryID`, `ActivityType`, unknown-CaseID response, phone format.
- Decision: should a request with some items approved read "In progress" instead of "Opened"? (locked D-06 says Opened.)
- Commit or discard the uncommitted edits in `src/frontend/` before Plan 07-08 removes that folder.
- Fix "32 questions" → 28 in `CLAUDE.md` and `.claude/CLAUDE.md`.
