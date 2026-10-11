# `app/worker/src/financials/propose/window.test.ts`

Unit tests for `completeMonthsWindow`. They need no network.

| Test | Checks |
|------|--------|
| 3 months | On 2026-10-11 the window is 2026-07-01 to 2026-09-30. |
| 6 months | On 2026-10-11 the window starts on 2026-04-01. |
| Year boundary | On 2026-01-01 a 3-month window is 2025-10-01 to 2025-12-31. |
| Leap February | On 2028-03-31 the window ends on 2028-02-29. |

Run with `pnpm -C app exec vitest run --project worker-node worker/src/financials/propose/window.test.ts`.
