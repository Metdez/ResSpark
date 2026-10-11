# `app/worker/src/financials/rpc.test.ts`

Unit tests for `rpc.ts` with the admin client mocked (`vi.mock('../db/client')` returns an object
whose `rpc` is a `vi.fn`). No network, no env.

| Test | What it proves |
|------|----------------|
| passes p_* parameters and returns data | `upsertProposals` calls `financial_proposals_upsert` with `p_firm_id`, `p_case_id`, `p_source`, `p_scope_columns: null`, `p_actor_type: 'system'` and returns the RPC data. |
| maps a RAISE token to FinancialRpcError | A `proposal_stale` message becomes `FinancialRpcError` with code `proposal_stale`. |
| maps a CHECK violation (23514) to bad_value | Postgres code `23514` becomes `bad_value`. |
| hides any other database message | An unknown error becomes exactly `financials_rpc_failed`; the database text never leaks. |

Run: `pnpm -C app exec vitest run --project worker-node worker/src/financials/rpc.test.ts`.
