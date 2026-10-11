# `app/worker/src/db/cases.ts`

Worker access to the `cases` table for the confirm step (D-05, LOOK-04).

| Lines | What it does |
|-------|--------------|
| 1-3 | The `LogicsCaseSummary` type, the per-request admin client, and the RPC token scanner. |
| 5 | `DbEnv`: only the two Supabase values are needed. |
| 7-17 | `CaseRow`: the columns read back by `getCase`. `logics_case_id` is `null` for cases not linked to Logics. |
| 19-38 | `confirmLogicsCase`: calls `case_confirm_logics` with the summary fields, the normalized phone, the summary itself as `p_snapshot`, the staff user id, and the search type. The RPC upserts on `(firm_id, logics_case_id)` and logs `case.looked_up` in the same transaction. A known RAISE token is rethrown as its own message; any other error becomes `case_confirm_failed`, so Postgres text never leaves this function. Returns `cases.id`. |
| 40-49 | `getCase`: one row by id **and** `firm_id`, so a case of another firm reads as `null`. Errors become `case_lookup_failed`. |

## Tests

Mocked in `app/worker/test/admin-lookup.test.ts`; the RPC itself is proven live in `app/worker/test/requests-live.test.ts`.
