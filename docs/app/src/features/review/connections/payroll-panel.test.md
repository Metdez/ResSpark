# `app/src/features/review/connections/payroll-panel.test.tsx`

Component tests for `PayrollPanel`. `../api` `documentUrl` and `sonner` are mocked, and `window.open` is stubbed. The Acme fixture has three `recent_pay` rows (Sep 15 with stub `P1`, Aug 31 with a null net and no stub, Aug 15 with stub `P2`); the errored employer has none.

| Test | Checks |
|------|--------|
| employers | Name, `Done` badge and joined counts for Acme; the `Employer` fallback and `Needs attention` for the errored one. |
| link labels | The document list (`ul button`) reads `Pay stub · …`, `W-2 · …`, `Income report · …`, `1099 · …`. |
| open | Clicking the first document link calls `documentUrl('P1', 'inline')` and `window.open(url, '_blank', 'noopener')`. |
| last three months table | `Last 3 months` is present; the `data-pay-date` rows are in fixture order (newest first); the first row's cells read `Sep 15, 2026`, `$2,000.00`, `$1,500.00`, `Stub`, and the third `Aug 15, 2026`, `$1,950.50`, `$1,480.25`, `Stub`. |
| null net | The Aug 31 row reads `—` for net and has an empty last cell. |
| totals line | `3 pay stubs · gross $5,950.50 · net $2,980.25`; re-rendered with one row, `1 pay stub · gross $2,000.00 · net $1,500.00`. |
| stub link | Clicking the third row's `Stub` calls `documentUrl('P2', 'inline')` and opens the signed URL. |
| no recent pay | The errored employer renders no `table` and no `Last 3 months` text. |
| zero documents | `No documents yet` and no buttons. |
| no employers | `No employers yet`. |

Helpers: `employer(id)` selects the section, `payRows(id)` its `[data-pay-date]` rows, `cells(row)` the `td` texts, and `click(button)` clicks inside `act` and lets the signed-URL promise settle.
