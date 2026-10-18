# `app/worker/src/storage/display-names.ts`

Human-readable names for provider-fetched files: the `displayName` that `storeProviderFile` writes to `documents.original_filename`, which is what staff read in Review and what the Logics push sends (Oct 12 call, 8:00: "pay stub underscore October 12, 2026 … an actual person has to read this inside Logics").

Storage keys are not touched. `name` (`2026-09.pdf`, `paystub-2026-10-12[-<check>].pdf`, `w2-2025.pdf`, `income-report.pdf`) still builds `providerObjectPath`, because `financials/evidence.ts` matches stubs by the key suffix `/paystub-<pay_date>[-<check>].pdf` and `connections-ops` matches employers by folder. Only the row's `original_filename` changes.

Pure module: no imports, no `Date`. Dates are rebuilt from their string parts, so a pay date is never shifted by the Worker's timezone.

| Export | Result |
|--------|--------|
| `longDate(iso)` | `'2026-10-12'` gives `'October 12, 2026'`. Anything that is not `YYYY-MM-DD` (or has a month outside 1-12) comes back unchanged. |
| `statementDisplayName(year, month, mask)` | `'Bank statement - September 2026 - x1234.pdf'`, or `'Bank statement - September 2026.pdf'` when the mask is `null`. A month outside 1-12 falls back to its two-digit number. |
| `payStubDisplayName(payDate, check)` | `'Pay stub - October 12, 2026.pdf'`; with a check number `'Pay stub - October 12, 2026 - check 1001.pdf'` (only `[A-Za-z0-9-]` of the check is kept; an empty remainder drops the suffix). A `null` date reads `'Pay stub - undated.pdf'`. |
| `w2DisplayName(year)` | `'W-2 - 2025.pdf'` (`year` may be a string such as `'unknown'`). |
| `INCOME_REPORT_DISPLAY_NAME` | `'Income report.pdf'`. |

Every helper strips `/ \ : * ? " < > |` from its result, because Logics is a Windows-facing product and those characters are not allowed in a Windows file name. `longDate` itself does not strip (it returns non-ISO input unchanged by contract); `payStubDisplayName` strips after it.

## Callers

- `jobs/bank-statements.ts`: `displayName: statementDisplayName(s.year, s.month, account.mask)`.
- `integrations/truv/reports.ts`: sets `TruvFile.displayName` for the income report, pay stubs and W-2s; a client's Bridge upload keeps its own `filename` (else the storage name).
- `jobs/payroll-reconcile.ts`: passes `f.displayName` through to `storeProviderFile`.

## No backfill

Rows stored before this change keep their old `original_filename` (`2026-09.pdf`, `paystub-2026-10-12.pdf`, ...). Only files stored from now on get the readable names; a rerun does not rename an existing row because `storeProviderFile` returns early when the storage key exists.

## Tests

`display-names.test.ts` (worker-node project): see `display-names.test.md`.
