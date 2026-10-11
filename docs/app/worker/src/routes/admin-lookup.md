# `app/worker/src/routes/admin-lookup.ts`

The staff lookup and confirm API (D-05, D-15, LOOK-01, LOOK-02, LOOK-04). Mounted in `index.ts` at `/api/admin`, it owns `POST /api/admin/lookup`, `POST /api/admin/cases/:logicsCaseId/confirm`, and `GET /api/admin/cases/:id`. Every path runs behind `staffAuth`.

| Lines | What it does |
|-------|--------------|
| 1-9 | Hono and its `Context` type, `HTTPException`, the shared `normalizePhone`, the two case DB helpers, `getIntegration`, `LogicsError`, `resolveLogicsClient`, the lookup functions, and `staffAuth`. |
| 11 | `AdminApp`: the route's Hono generics, so `c.var.staff` is always set inside handlers. |
| 13-14 | The three lookup types and their type guard. `satisfies LookupType[]` keeps the list in step with the Logics module. |
| 15 | Input errors thrown by `lookupCases` that become 400 with the same code. |
| 16-17 | Path-param shapes: a Logics CaseID is 1 to 9 digits; a local case id is a UUID. |
| 19 | `badRequest()`: the shared 400 `bad_request`. |
| 21-32 | `toHttp`: maps a `LogicsError` kind to a fixed code. `not_configured` → 409 `logics_not_configured`; `unauthorized`/`forbidden` → 502 `logics_unauthorized`; `network`/`upstream`/`invalid_response` → 502 `logics_unreachable`. A known input error → 400 with its code. Anything else is rethrown unchanged and `onError` turns it into 500 `internal`. |
| 34-37 | `logicsClient`: reads the firm's `firm_integrations` row and lets `resolveLogicsClient` pick fixtures or live. In `LOGICS_MODE=fake` the row is ignored. |
| 39-42 | `readBody`: the JSON body, or `{}` for a missing or non-JSON body, never a throw. |
| 44-45 | The route instance and `staffAuth` for every method and path under it. |
| 46-57 | `POST /lookup`: `type` must be in the enum, `value` a non-blank string, and `last_name`, when present, a string; otherwise 400 before Logics is touched. Returns `{ results, mode }`. `mode` is always present so the SPA can label fixture data (C1). Empty, null, and `Success:false` Logics answers already come back from the client as `[]`. |
| 58-84 | `POST /cases/:logicsCaseId/confirm`: the path id and `search_type` are the only inputs; every other body field is ignored (C8, T-02-11). It re-reads `Case/CaseInfo` for that id (404 `case_not_found` when Logics has no case, and nothing is written), normalizes the first present phone in cell, home, work order to E.164, and calls `confirmLogicsCase` with the fresh summary as the snapshot. Firm and actor come from the verified staff context. The response is `{ case_id, logics_case_id, first_name, last_name, email, phone_e164 }`. |
| 85-93 | `GET /cases/:id`: 400 for a non-UUID id, then a firm-scoped read. A missing case and another firm's case both return 404 `not_found` (Pattern 2). The response leaves out `firm_id` and `logics_snapshot`. |

## Privacy

- The search value never reaches an event or log line. The `case.looked_up` event written by the RPC holds `search_type` and `logics_case_id` only, and the logger is the allowlisted one from Phase 1.
- `LogicsCaseSummary` has no DOB or money fields by construction (Plan 02 mapper), so the snapshot cannot carry them.

## Concurrency

Two confirms of the same case, even from two sessions at once, return the same `case_id`: `case_confirm_logics` upserts on `(firm_id, logics_case_id)`, and each call logs its own `case.looked_up` event (proven live in Plan 01).

## Tests

`app/worker/test/admin-lookup.test.ts`.
