# `app/worker/src/financials/db.ts`

This module holds the reads and the single insert behind the 433-A admin routes. Each function creates its own service-role client with `createAdminClient(env)`. When a query fails, the function throws a fixed `Error` code and never passes on the database message, because that message could quote a value (D-20).

| Part | What it does |
|------|--------------|
| `FinancialsCase` | The case header the view needs: id, Logics case id, client name, and `financials_settings` (JSONB, migration 0008). |
| `ProposalRow` | One `financial_proposals` row, with the columns the view and status rules read. |
| `MONEY` / `coerce` | Turns any string value in a `money` column into a `Number`. Live testing showed PostgREST renders `numeric(14,2)` as a JSON number, so this is only a guard: a string here would turn engine addition into string concatenation. |
| `getCaseForFinancials(env, firmId, caseId)` | Reads the case filtered by **both** `firm_id` and `id`, so another firm's case comes back as `null` and the route answers 404 (T-07-15). It then reads the `case_financial_data` row, which is `null` when absent. |
| `listProposals(env, firmId, caseId)` | All proposals for the case except `superseded`, newest first. It filters by firm as well, as defense in depth. |
| `getStandardsVersion(env)` | The single `standards_versions` row (`effective_date`, `source_url`), or `null`. |
| `staffDisplayNames(env, firmId, ids)` | `staff_profiles.display_name` by user id, limited to the firm. It skips the query when `ids` is empty. |
| `insertDeterminationRun(env, run)` | Inserts one `determination_runs` row and returns it. Runs are insert-only (D-15, T-07-19). Nothing in the Worker updates or deletes them. |
| `getLatestRun(env, firmId, caseId)` | The newest run for the case within the firm, or `null`. |
