# `app/src/lib/statement-months.ts`

The bank-statement month window, shared by the Worker (which statements to fetch) and the SPA (the staff statement grid). Pure date math, no imports.

- `STATEMENT_MONTHS = 6` (pull six months), `STANDARD_MONTHS = 3` (the standard resolution packet uses the last three).
- `MonthCell`: `{ year, month }` with `month` 1..12.
- `targetMonths(now, count = 6)`: `count` cells newest first, starting with the month before `now`; the current, unfinished month never has a statement. Uses UTC so the Worker and the browser agree; `year * 12 + month` arithmetic handles the January rollover.
- `monthLabel(year, month)`: `Mar 2026`.
- `isInWindow(cell, now, count = 6)`: whether a cell is one of `targetMonths(now, count)`; both window edges are inclusive.

## Tests

`statement-months.test.ts`: the six-month window from October 2026, the January rollover, the inclusive window edge, and the label.
