# `app/worker/src/financials/propose/window.ts`

The bank and payroll proposals read a window of complete calendar months (D-07). Staff choose 3 or 6 months in `cases.financials_settings.window_months`.

| Part | What it does |
|------|--------------|
| `iso(d)` | Returns the date part (`YYYY-MM-DD`) of a UTC `Date`. |
| `completeMonthsWindow(now, months)` | Returns `{ start, end, months }`. `end` is the last day of the calendar month before `now`. `Date.UTC(y, m, 0)` gives this, because day 0 of a month is the last day of the month before it. `start` is the first day of the month `months` months before `now`. `Date.UTC` handles negative months, so the window can cross a year boundary. All the math is in UTC. |

Examples: on 2026-10-11, a 3-month window is 2026-07-01 to 2026-09-30, and a 6-month window starts on 2026-04-01. On 2026-01-01, a 3-month window is 2025-10-01 to 2025-12-31.

`Date` is fine here. The `engine/` must stay free of clock reads, and this module is not part of it.
