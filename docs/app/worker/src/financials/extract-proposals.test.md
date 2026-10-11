# `app/worker/src/financials/extract-proposals.test.ts`

Unit tests (`worker-node` project, no database) for the pure parts of `extract-proposals.ts`. The live route path is covered by `worker/test/financials-extract.test.ts`.

| Test | What it checks |
|------|----------------|
| LINES columns only | `{ total_tax_owed: 1234.5000000001, state_of_residence, county_of_residence, _kind, not_a_column }` gives exactly one proposal: `total_tax_owed` 1234.5, method `regex_extract`, reliability B, no window, and one `document` ref per given file. |
| Lists, counts, booleans, text | `[1000.004, 2000]` becomes `[1000, 2000]`; `vehicle_count`, `owns_home` and `pay_frequency` pass through unchanged. |
| Wrong types are dropped | NaN money, a fractional count, a string boolean and a non-numeric list produce no proposals, so one bad value cannot fail the whole RPC batch. |
| `failReason` | `No template matched…` is `no_template`; `Missing…`, `No amount…` and `No dollar amount…` are `missing_fields`; any other `ExtractError` or a plain `Error` is `unreadable`. |
