# `app/worker/src/routes/admin-financials.test.ts`

Unit tests for the 433-A admin routes through `app.request`. These tests use no database. The test mocks four things:

- `staffAuth`, which sets `{ userId: 'U1', firmId: 'F1' }`;
- `financials/db`, every function;
- `decideValue` and `fetchStandardsBundle`. `FinancialRpcError` stays the real class, so `instanceof` works.
- By default, `getCaseForFinancials` resolves `null`, which means a foreign or missing case.

| Case | What it checks |
|------|----------------|
| passes the session firm and actor | `decideValue` receives the firm and the actor from the session, along with the case id, the column, the action and the note. `proposalId` defaults to `null`. |
| unknown column | `updated_at` is not a line column, so the route returns 400 `bad_column` and never calls the RPC. |
| body guard | `{ action: 'nope' }`, an empty body, a non-UUID `proposal_id`, and a non-string `note` each return 400 `bad_request`, and the RPC is not called. |
| RPC mapping | `note_required`, `bad_value` and `bad_action` return 400. `proposal_stale` returns 409. `case_not_found` returns 404 `not_found`. |
| other errors | A plain `Error` returns 500 `internal`. |
| non-UUID case id on decide | Returns 404, and the RPC is not called. |
| foreign or missing cases | GET financials, POST evaluations and GET evaluations/latest each return 404 `not_found` when the firm-scoped read (`F1`) finds no case. |
| non-UUID id | Returns 404 before any read. |
| refresh body guard | `window_months` 4 or `'6'`, a non-array, a number, an empty or 101-character id, and 21 ids each return 400 before `getCaseForFinancials` is called. |
| refresh, foreign case | A valid body for a case the firm-scoped read cannot find returns 404. |
