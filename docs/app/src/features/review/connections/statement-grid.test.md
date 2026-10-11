# `app/src/features/review/connections/statement-grid.test.tsx`

Component tests for `StatementGrid` with `now` fixed to 2026-10-10. `../api` `documentUrl` and `sonner` are mocked, and `window.open` is stubbed.

| Test | Checks |
|------|--------|
| 3/6 split | Group headers `Last 3 months` and `Months 4–6`, each `colspan="3"`; month labels Sep 2026 → Apr 2026, newest first. |
| account label | `Checking ••0000`. |
| cell badges | Statement, Uploaded, Missing, Not from bank, Checking, and Missing for the absent April. |
| open statement | `Open Sep 2026 statement` calls `documentUrl('D9', 'inline')`, then `window.open(url, '_blank', 'noopener')`. |
| open upload | `Open Aug 2026 upload` reads `Uploaded` and opens `D8`. |
| not clickable | Only the first two cells contain a button. |
| order | Accounts keep the given order. |
| URL failure | A rejected `documentUrl` shows the `Couldn't open this file` toast with the code and opens nothing. |
