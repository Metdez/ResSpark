# Phase 07 deferred items

Out-of-scope issues found while executing phase 07 plans. Not fixed by the plan that found them.

## Found during 07-01

- **`tsc -b` fails at base `dbec332`:** `app/src/components/sign-out-dialog.tsx(2,30): error TS2307: Cannot find module '@/stores/auth-store'`. The file imports `@/stores/auth-store`, which has never been tracked in git (the shadcn-admin fork's store was stripped; 01-06 moved sign-out to `lib/session`). It is the only `tsc -b` error and it predates 07-01, so `pnpm -C app check` cannot reach `eslint`/`pnpm test` through `tsc -b` in a clean checkout. Fix belongs with the 01-06 sign-out work (point `SignOutDialog` at `signOutEverywhere` from `@/lib/session`, or drop the dialog).
