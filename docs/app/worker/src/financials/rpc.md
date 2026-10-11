# `app/worker/src/financials/rpc.ts`

Typed Worker wrappers for the three Phase 7 RPCs of migration `0008_433a_prepopulation.sql`. Every
call uses `createAdminClient(env)` (service role, created per call) and the `p_*` parameter names of
the SQL functions. The module never logs and never returns a database message, because a message
can quote a value (D-20).

| Part | What it does |
|------|--------------|
| `DbEnv` | The two env bindings the admin client needs. |
| `ProposalSource` | Generator sources that may write proposals. `staff` is not one of them: staff values arrive only through `decideValue`. |
| `Reliability` | `A` (document or verified data), `B` (derived), `C` (client answer). |
| `SourceRef` | One evidence pointer stored in `financial_proposals.source_refs`: a kind, an id and a display label. |
| `ProposalInput` | One proposed value for one `case_financial_data` column, with its method, window and reliability. |
| `DecideAction` | The six staff actions of `financial_value_decide`. |
| `TOKENS` / `FinancialRpcCode` | The RAISE tokens the wrappers expose: `case_not_found`, `bad_action`, `bad_column`, `bad_value`, `note_required`, `proposal_stale`, `bad_source`. |
| `FinancialRpcError` | An `Error` whose `code` is one of those tokens; routes map it to an HTTP status. |
| `toError` | Postgres `23514` (a table CHECK such as `household_size >= 1`) becomes `bad_value`; a known token anywhere in the message becomes `FinancialRpcError(token)`; anything else becomes a plain `Error('financials_rpc_failed')` with no database text. |
| `upsertProposals` | Calls `financial_proposals_upsert`; returns `{ inserted, kept, superseded }`. `scopeColumns` limits which absent columns are superseded; `actor` defaults to `system`. |
| `decideValue` | Calls `financial_value_decide`; `value`, `proposalId` and `note` default to `null`. Returns `{ column, action, proposal_id }`. |
| `fetchStandardsBundle` | Calls `standards_bundle` and returns the raw JSON (Plan 04 validates its shape). |

## Tests

- `app/worker/src/financials/rpc.test.ts` (unit, mocked client): parameter names, token mapping, `23514` to `bad_value`, other errors hidden.
- `app/worker/test/financials-rpc.test.ts` and `app/worker/test/standards-bundle.test.ts` (live).
