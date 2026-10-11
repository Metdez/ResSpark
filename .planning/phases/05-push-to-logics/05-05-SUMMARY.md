---
phase: 05-push-to-logics
plan: 05
subsystem: logics-push
tags: [logics, settings, demo-safety, runbook, smoke]
requires: [05-03, 05-04]
provides: [push-settings-ui, logics-live-switch-runbook, smoke-logics-mode, fake-mode-push-unblocked]
key-files:
  created: [app/src/features/settings/integrations/push-settings-card.tsx, app/src/features/settings/integrations/push-settings-card.test.tsx, docs/app/logics-live-switch.md, docs/app/src/features/settings/integrations/push-settings-card.md, docs/app/src/features/settings/integrations/push-settings-card.test.md]
  modified: [app/worker/src/routes/admin-logics-push.ts, app/worker/src/jobs/logics-push.ts, app/src/features/settings/integrations/logics-settings-api.ts, app/src/features/settings/integrations/logics-settings-page.tsx, app/scripts/smoke.mjs, app/.dev.vars.example, docs/app/README.md, docs/app/wrangler.md, docs/app/scripts/smoke.md]
decisions:
  - "D-10 applied as locked: the env guard (LOGICS_WRITE_ENABLED + test-CaseID allowlist) runs in live mode only, in the route and the consumer. The firm write_enabled toggle applies in both modes."
  - "The push settings card is a separate push-settings-card.tsx. The api module is logics-settings-api.ts (the plan called it integrations-api.ts)."
status: complete
actuals: { tokens: 22000, tasks: 2, commits: 3 }
plan_head_before: 1c133d2140e2a88c4da06adfed5ab8297f8fb848
plan_head_after: 1df2133ac61a745ea2799111947e2662064cc2e2
completed: 2026-10-11
---

# Phase 5 Plan 05: Push settings, live-switch runbook, and fake-mode push unblocked Summary

Settings → Integrations now has a Push settings card (file category, activity type, Write enabled). The Logics env write guard is limited to live mode, so fake-mode pushes work while `LOGICS_WRITE_ENABLED=false`. Switching to live is written up as an ordered USER ACTION runbook, and the smoke check prints the deployed mode.

## Commits (3 of this plan; `rev-list` reports 15 because other executors committed on the shared tree)
- d3e5304 fix(05-05): limit the Logics env write guard to live mode (D-10). Tests: fake mode + flag false → 202 with `mode: 'fake'`; live mode + flag false → 403 `logics_write_blocked`; the consumer in fake mode skips the guard.
- f020019 feat(05-05): Push settings card (8 tests).
- 1b60608 docs(05-05): `docs/app/logics-live-switch.md`, the smoke `logics_mode` check, and `.dev.vars.example` notes.

## Deviations
- [Rule 1, orchestrator-directed] Before this plan the route and the consumer ran the env guard in fake mode too, which refused every demo push. Now they run it in live mode only, following locked D-10. Nothing was relaxed for live mode. `wrangler.jsonc` still has `LOGICS_MODE=fake` and `LOGICS_WRITE_ENABLED=false`.
- `None listed — …` is not shown. The SPA cannot tell an empty listing apart from "no test CaseID configured", so an empty list always reads `Not checked — …`.
- The smoke line prints as `ok /api/config (logics_mode=fake)`; the plan wrote it as `ok config (…)`.
- I deployed once (version d82ad005, 11:14 EDT) after a green `check`. The coordinator's "do not deploy" message arrived after that. I will not deploy again.

## Gate
- `pnpm -C app run check`: exit 0, 1350 passed / 172 skipped (the first run failed once in `request-page.test.tsx`, another plan's in-progress file; the re-run was green).
- `test:live`: 2 timeouts, neither in this plan's code. `bank-complete.test.ts` has 04-04's uncommitted bank changes in the tree. `connections-tracer.test.ts` timed out under load and passes when run alone. `logics-push`, `logics-rpc`, `rls` and `connections-tracer` together: 61/61 passed (fake CaseDocumentID 305015, ActivityID 9614297).
- Deployed smoke: 13/13 ok, including `ok /api/config (logics_mode=fake)`.

## Rehearsal (remaining)
- Automated: the live fake-mode end-to-end test (route → queue → consumer → ledger → activity) passed against the live database.
- Not done: the UI rehearsal (approve → push → chip `Queued → Sending → Sent` with `Simulated`, activity preview, banner `SANDBOX · Logics writes simulated`). Do it on the deployed site after the orchestrator's ~11:42 deploy, once the demo step below is done.

## USER ACTION REQUIRED
- Demo step: a ValorTax admin turns on **Write enabled** in Settings → Integrations → Push settings and saves. Until then every push returns 403 `Logics writes are turned off for this firm in Settings`.
- Before `LOGICS_MODE=live` (see `docs/app/logics-live-switch.md`), Andrew must provide: a write-scoped API key (`case.write` + `activity.write`) and its Secret Token, pasted only in Settings; 2–3 fake test CaseIDs; written confirmation of the scopes; and the `FileCategoryID` value (or leave it empty). Then follow the runbook order and record `CaseDocumentID`/`ActivityID` here.

## Threat Flags
None. No new endpoints. T-05-24: the flags are unchanged and the smoke prints the mode. T-05-25: the runbook names fields only. T-05-26: staff see the settings read-only, and the Worker enforces admin.

## Self-Check: PASSED
