# `app/worker/src/storage/display-names.test.ts`

Unit tests for `display-names.ts` (worker-node project, no mocks).

1. `longDate`: `2026-10-12` is `October 12, 2026`, `2026-01-01` is `January 1, 2026`, `2025-12-31` is `December 31, 2025`; `undated`, `2026-9-1`, `10/12/2026`, `2026-13-01` and `''` come back unchanged.
2. `statementDisplayName`: `(2026, 9, '1234')` is `Bank statement - September 2026 - x1234.pdf`; a `null` mask drops the suffix.
3. `payStubDisplayName`: `Pay stub - October 12, 2026.pdf`; with check `1001`, `... - check 1001.pdf`; a check of `CK/10:01?` keeps `CK1001`; a check of `/:*` drops the suffix; a `null` date reads `undated` (with or without a check); a non-ISO date `10/12/2026` loses its slashes (`Pay stub - 10122026.pdf`).
4. `w2DisplayName(2025)` is `W-2 - 2025.pdf`, `w2DisplayName('unknown')` is `W-2 - unknown.pdf`; `INCOME_REPORT_DISPLAY_NAME` is `Income report.pdf`.
5. Windows-safe sweep: names built from a mask, a month of 13, a pay date and a check full of forbidden characters, and a year with `*`, never contain `/ \ : * ? " < > |`.
