# `app/worker/src/routes/admin-financials.ts`

The staff 433-A routes (D-19, FORM-04/05), mounted at `/api/admin` in `index.ts`, before the lookup route, which must stay last. Every route sits behind `staffAuth`, scoped to `/cases/*` (T-07-14). The firm id always comes from `c.var.staff.firmId` and never from the path or body (T-07-15).

| Part | What it does |
|------|--------------|
| `UUID`, `ACTIONS`, `MAX_NOTE` | Path id format, the six decide actions, and the note length cap (2000). |
| `RPC_STATUS` | Maps `FinancialRpcError` codes to HTTP status and error code (table below). Any other error goes to `onError` as 500 `internal`. |
| `caseIdParam` | Returns `:id` when it is a UUID. Otherwise it throws 404 `not_found`, because a malformed id is treated the same as a missing or foreign case. |
| `namesFor` | Display names for decider and creator ids, from `staff_profiles` within the firm. The caller's own name comes from the verified session, so a staff member always sees their own name. |
| `GET /cases/:id/financials` | Reads the case and row (404 if the case is foreign or missing), the proposals and the standards version. It returns `buildFinancialsView(...)`: the case header, settings, `standards_version`, `required`, and the seven sections with every line, status and competing proposal. |
| `POST /cases/:id/financials/:column/decide` | Validates `:column` against `LINES` and returns 400 `bad_column` before any RPC call (T-07-16). It then guards the body: `action` must be one of the six actions, `proposal_id` must be a UUID or null, and `note` must be a string of at most 2000 characters or null. Failing any of these gives 400 `bad_request`. Next it calls `decideValue` with the session's firm and user. It returns 200 `{ column, action, proposal_id }`. The value check, the note requirement and the stale-proposal check run in the RPC (Plan 02). |
| `POST /cases/:id/evaluations` | Calls `evaluateForCase`. It returns 404 for a foreign or missing case and 201 `{ run, outcome: { kind: 'determination' } }` when a run was recorded. It returns 200 `{ run: null, outcome }` for `information_needed` or `standards_unavailable`, and in those cases nothing is written. |
| `GET /cases/:id/evaluations/latest` | Returns 404 for a foreign or missing case, otherwise 200 `{ run }`: the newest run as a `RunView`, or `null`. |

## Errors

| Status | Code | When |
|--------|------|------|
| 401 | `unauthorized` | No or invalid staff token (`staffAuth`) |
| 400 | `bad_request` | Decide body: unknown `action`, a non-UUID `proposal_id`, or a non-string or over-long `note` |
| 400 | `bad_column` | `:column` is not a line column. This is checked before the RPC, which also raises it. |
| 400 | `bad_value` | The RPC rejected the value's type or range, or a table CHECK failed (`23514`) |
| 400 | `note_required` | `edit` or `not_applicable` was sent without a note |
| 400 | `bad_action` | The RPC rejected the action |
| 404 | `not_found` | Non-UUID id, a case of another firm, a missing case, or the RPC's `case_not_found` |
| 409 | `proposal_stale` | `accept` or `reject` without a proposal id, or the proposal is no longer `proposed` |
| 500 | `internal` | Anything else. The message is never serialized. |

## Tests

- `app/worker/src/routes/admin-financials.test.ts` (unit, with mocked db, rpc and evaluate): the error mapping, the column check before the RPC, a non-UUID id, the body guard, and a foreign case.
- `app/worker/test/financials-api.test.ts` (live): the read, accept, evaluate and latest path, plus the information-needed and standards-unavailable outcomes.
