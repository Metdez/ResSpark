# `supabase/migrations/0012_provider_display_names.sql`

Data-only backfill: provider files stored before 2026-10-18 get the same human-readable `documents.original_filename` that `app/worker/src/storage/display-names.ts` gives new files, so an older case pushes readable names to Logics (Oct 12 2026 call, 8:00: "an actual person has to see this inside Logics"). Applied to the live project with `node app/scripts/db-migrate.mjs` on 2026-10-18.

## What it changes

Only `original_filename`, only on rows whose `uploaded_by_actor` is `provider:plaid` or `provider:truv` and whose name still matches an old machine pattern. `storage_key`, `sha256`, `size_bytes` and `status` do not change, so the stored bytes do not move and `financials/evidence.ts` keeps matching pay stubs by key suffix. Running it twice matches zero rows.

| Section | Old name | New name | Rows on live (2026-10-18) |
|---|---|---|---|
| (a) | `YYYY-MM.pdf` | `Bank statement - September 2026 - x1234.pdf` | 70 |
| (b) | `paystub-YYYY-MM-DD[-check].pdf` | `Pay stub - October 12, 2026 - check 1001.pdf` | 32 |
| (c) | `w2-YYYY.pdf` | `W-2 - 2025.pdf` | 12 |
| (d) | `income-report.pdf` | `Income report.pdf` | 4 |

Details:

- The bank mask is read from the storage key folder (`.../bank/<mask>/YYYY-MM.pdf`, see `connection-files.md`). It is appended as ` - x<mask>` only when that folder is all digits; a null mask stores the external account id there, and then nothing is appended, matching `statementDisplayName(year, month, null)`.
- The pay-stub check number keeps only `[A-Za-z0-9-]`, as `payStubDisplayName` does; an empty remainder appends nothing.
- Month and day names come from `to_char(..., 'FMMonth YYYY')` and `'FMMonth FMDD, YYYY'` (`FM` strips the padding), the same words `display-names.ts` emits.
- Client uploads made inside Truv Bridge keep the client's own file name; they never matched these patterns.

## Verification after apply

```sql
SELECT count(*) FROM public.documents
WHERE uploaded_by_actor LIKE 'provider:%'
  AND original_filename ~ '^(\d{4}-\d{2}|paystub-.*|w2-\d{4}|income-report)\.pdf$';
-- expected 0
```

## Related

- `docs/app/worker/src/storage/display-names.md`: the TypeScript twin of these four rules.
- `docs/app/worker/src/storage/connection-files.md`: `storeProviderFile.displayName`.
