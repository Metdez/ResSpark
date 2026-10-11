# Phase 07 deferred items

Out-of-scope issues found while executing phase 07 plans. Not fixed by the plan that found them.

## Found during 07-01

- **`tsc -b` fails at base `dbec332`:** `app/src/components/sign-out-dialog.tsx(2,30): error TS2307: Cannot find module '@/stores/auth-store'`. The file imports `@/stores/auth-store`, which has never been tracked in git (the shadcn-admin fork's store was stripped; 01-06 moved sign-out to `lib/session`). It is the only `tsc -b` error and it predates 07-01, so `pnpm -C app check` cannot reach `eslint`/`pnpm test` through `tsc -b` in a clean checkout. Fix belongs with the 01-06 sign-out work (point `SignOutDialog` at `signOutEverywhere` from `@/lib/session`, or drop the dialog).
  - Same cause, second symptom: `pnpm test` fails the `web` suite `src/routes/admin/guard.test.tsx` at import ("Failed to resolve import `@/stores/auth-store`"). Every other suite passes (416 tests passed, 52 skipped).
  - In the 07-01 worktree, each `pnpm check` stage was therefore run directly: size gate and `export_golden_fixtures.py --check` pass inside `pnpm -C app check`; `eslint .` exits 0; `pnpm test` is green except that one suite.

**Resolved 2026-10-11 (orchestrator):** the broken `@/stores/auth-store` import existed only at base `dbec332` (01-06 deletions swept into that commit before 01-06 updated `sign-out-dialog.tsx` in `4c92c86`). After merging 07-01 into `zack` at `eb7755e`, `pnpm -C app run check` passes in full (451 passed, 52 skipped).
