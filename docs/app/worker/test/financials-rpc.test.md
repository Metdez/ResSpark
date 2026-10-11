# `app/worker/test/financials-rpc.test.ts`

Live proof of the D-05/D-06/D-07 write path through the Worker wrappers in
`app/worker/src/financials/rpc.ts`. Skips with a printed reason when `SUPABASE_URL` or
`SUPABASE_SECRET_KEY` is missing. Each test seeds its own case with `seedFinancialCase`;
`afterAll` cleans up (cases and events stay).

Run: `pnpm -C app run test:live:file worker/test/financials-rpc.test.ts` (also part of `test:live`).

| Part | What it does |
|------|--------------|
| `proposal()` | Builds a `ProposalInput` (reliability C, no refs, no window). |
| `codeOf()` | Resolves to the `FinancialRpcError` code (or error message, or `resolved`). |
| `row`, `proposals`, `events` | Admin reads of `case_financial_data`, `financial_proposals` and `events` for one case. |
| tracer | Upsert `household_size` 3 → `{1,0,0}`; accept → only that column is set, the proposal is `accepted` with `decided_by`, one `financial.value_accept` event whose keys are within `column/proposal_id/source` and whose values never contain 3. |
| edit, known_zero, unknown, reject | `edit` without a note → `note_required`; edit of a Plaid proposal to 2400.5 → `edited`; accepting it again → `proposal_stale`; edit without a proposal → a `staff` row `edited`; `known_zero` → 0 and a `staff` row `accepted`; `known_zero` on a boolean → `bad_value`; `unknown` → NULL; `reject` → proposal `rejected`, column unchanged. |
| not_applicable | `age_spouse` → 0, `filing_joint_offer` → false, `pay_frequency` → `not_applicable`; without a note → `note_required`. |
| guards | `case_id` and `nope` → `bad_column`; 1.005, 2.5 on an integer and `household_size` 0 (CHECK 23514) → `bad_value`; another firm → `case_not_found`; accepting a superseded proposal → `proposal_stale`. |
| per-vehicle list | `[10000, 5000.5]` → `vehicle_market_value_total` 15000.5 and the event carries `derived_from: per_vehicle_list`. |
| upsert rules | Same payload → kept; changed value → superseded + inserted; a run without a column supersedes it; `scopeColumns` limits that; after accept the same value is kept, not re-proposed. |
| upsert guards and concurrency | JSON null → `bad_value`; source `staff` → `bad_source`; two concurrent upserts (`Promise.all`) both resolve and leave one `proposed` row. |

## Result (2026-10-11, live project `zvkphuikjpwoauqdimcf`)

7 passed, 0 failed.
