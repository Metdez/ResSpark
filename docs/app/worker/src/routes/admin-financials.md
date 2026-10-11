# `app/worker/src/routes/admin-financials.ts`

The staff 433-A routes (D-19, FORM-04/05), mounted at `/api/admin` in `index.ts`, before the lookup route, which must stay last. Every route sits behind `staffAuth`, scoped to `/cases/*` (T-07-14). The firm id always comes from `c.var.staff.firmId` and never from the path or body (T-07-15).

| Part | What it does |
|------|--------------|
| `UUID`, `ACTIONS`, `MAX_NOTE` | Path id format, the six decide actions, and the note length cap (2000). |
| `MAX_SPOUSE_IDS`, `MAX_ID_LENGTH` | Refresh body caps: at most 20 spouse employer ids, each 1 to 100 characters. |
| `refreshPatch(body)` | Validates the refresh body and returns only the keys that were sent. `window_months` must be exactly `3` or `6`. `spouse_employer_ids` must be an array of at most 20 non-empty strings of at most 100 characters, and it is de-duplicated. Anything else throws 400 `bad_request` before any read (T-07-24). |
| `RPC_STATUS` | Maps `FinancialRpcError` codes to HTTP status and error code (table below). Any other error goes to `onError` as 500 `internal`. |
| `caseIdParam` | Returns `:id` when it is a UUID. Otherwise it throws 404 `not_found`, because a malformed id is treated the same as a missing or foreign case. |
| `namesFor` | Display names for decider and creator ids, from `staff_profiles` within the firm. The caller's own name comes from the verified session, so a staff member always sees their own name. |
| `GET /cases/:id/financials` | Reads the case and row (404 if the case is foreign or missing), the proposals and the standards version. It also reads the payroll employers (`listCaseEmployers`) and the county block (`loadCountyBlock`, from the case's address columns, the FIPS map and the newest `address` county proposal). It returns `buildFinancialsView(...)` with `now = new Date()`: the case header, settings, `window`, `county`, `employers`, `standards_version`, `required`, and the seven sections with every line, status and competing proposal. |
| `POST /cases/:id/financials/refresh` | Body `{ window_months?: 3 or 6, spouse_employer_ids?: string[] }` (D-07, D-09, D-14). It validates with `refreshPatch`, then reads the case firm-scoped (404 otherwise). It merges the patch into `cases.financials_settings` and saves it with an update filtered by `id` and `firm_id`. It logs `financials.refresh_requested { window_months, spouse_employers: <count> }` with the staff actor, and sends `{ type: 'financials_propose', ref: caseId, reason: 'refresh' }` to `JOBS`. It returns 202 `{ queued: true, settings }`, where `settings` is `settingsOf(merged)`. |
| `POST /cases/:id/financials/:column/decide` | Validates `:column` against `LINES` and returns 400 `bad_column` before any RPC call (T-07-16). It then guards the body: `action` must be one of the six actions, `proposal_id` must be a UUID or null, and `note` must be a string of at most 2000 characters or null. Failing any of these gives 400 `bad_request`. Next it calls `decideValue` with the session's firm and user. It returns 200 `{ column, action, proposal_id }`. The value check, the note requirement and the stale-proposal check run in the RPC (Plan 02). |
| `GET /cases/:id/financials/:column/evidence` | Query `proposal_id?` (D-10, FORM-03). `:column` must be a line column (400 `bad_column`) and `proposal_id`, when sent, a UUID (400 `bad_request`). Calls `buildEvidence(env, { firmId, caseId, column, proposalId })` with the session's firm; `null` (a foreign or missing case, or a proposal id that is not this case's and column's) is 404 `not_found`. Returns 200 with the `EvidenceView` (see `financials/evidence.md`): signed URLs only, never storage keys or account numbers. |
| `POST /cases/:id/evaluations` | Calls `evaluateForCase`. It returns 404 for a foreign or missing case and 201 `{ run, outcome: { kind: 'determination' } }` when a run was recorded. It returns 200 `{ run: null, outcome }` for `information_needed` or `standards_unavailable`, and in those cases nothing is written. |
| `GET /cases/:id/evaluations/latest` | Returns 404 for a foreign or missing case, otherwise 200 `{ run }`: the newest run as a `RunView`, or `null`. |

## Errors

| Status | Code | When |
|--------|------|------|
| 401 | `unauthorized` | No or invalid staff token (`staffAuth`) |
| 400 | `bad_request` | Evidence query: a non-UUID `proposal_id`. Decide body: unknown `action`, a non-UUID `proposal_id`, or a non-string or over-long `note`. Refresh body: a window other than 3 or 6, or bad spouse employer ids |
| 400 | `bad_column` | `:column` is not a line column. This is checked before the RPC, which also raises it. |
| 400 | `bad_value` | The RPC rejected the value's type or range, or a table CHECK failed (`23514`) |
| 400 | `note_required` | `edit` or `not_applicable` was sent without a note |
| 400 | `bad_action` | The RPC rejected the action |
| 404 | `not_found` | Non-UUID id, a case of another firm, a missing case, or the RPC's `case_not_found` |
| 409 | `proposal_stale` | `accept` or `reject` without a proposal id, or the proposal is no longer `proposed` |
| 500 | `internal` | Anything else. The message is never serialized. |

## Tests

- `app/worker/src/routes/admin-financials.test.ts` (unit, with mocked db, rpc and evaluate): the error mapping, the column check before the RPC, a non-UUID id, the body guard, a foreign case, and the refresh body guard.
- `app/worker/test/financials-propose.test.ts` (live): refresh saves the settings, logs the event and enqueues the job. GET financials shows the county block, the window and the employers.
- `app/worker/test/financials-evidence.test.ts` (live): the evidence route for every source, the proposal-id scoping, 400s and a foreign case's 404.
- `app/worker/test/financials-api.test.ts` (live): the read, accept, evaluate and latest path, plus the information-needed and standards-unavailable outcomes.
