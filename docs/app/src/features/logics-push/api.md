# `app/src/features/logics-push/api.ts`

Typed callers and response guards for the three admin push routes of `app/worker/src/routes/admin-logics-push.ts` (Plan 05-01). The JSON shapes are mirrored here, not imported, like `features/review/api.ts`.

| Part | What it does |
|------|--------------|
| `PushState` | Re-exported from `components/status-badge.tsx` so the badge map and the ledger share one union. |
| `PushMode` | `'fake' \| 'live'`. A `fake` row never reached Logics. |
| `LedgerPush` | One ledger row (one part of one document): ids, `part_index` (0-based) and `part_count` (null until the consumer splits), `file_name`, `state`, `mode`, `logics_document_id` (null when staff confirmed without an id), error code and staff copy (`error_detail`), `needs_manual_compression`, attempts and timestamps. |
| `LedgerBatch` | One push click: agent name, mode, activity-note state and id, and its `pushes`. |
| `LedgerResponse` | `GET` result: `{ mode, batches }`, batches newest first, rows oldest first. |
| `CreatePushResponse`, `ResolveResponse` | The `202` push answer (`batch_id`, `push_ids`, `mode`) and the resolve answer (`state`, `new_push_id`). |
| `str`, `isMode`, `STATES` | Small guard helpers. |
| `isPush`, `isBatch` | Check the fields the UI reads (ids, state in the five known values, mode, part numbers, document id, the manual flag). |
| `isLedgerResponse` | Exported guard for the ledger; `api()` throws `invalid_response` when it fails. |
| `isCreated`, `isResolved` | Guards for the two POST answers. |
| `fetchLedger(requestId)` | `GET /api/admin/requests/:id/logics-pushes`. |
| `CaseWorksheet`, `WorksheetsResponse`, `isWorksheetsResponse` | Plan 07-06 (D-16): the contract of `GET /api/admin/cases/:id/worksheets` (`app/worker/src/routes/admin-worksheet.ts`). It returns `request_id` (the case's most recent request that is not revoked, or null) and the case's generated worksheets (`id`, `file_name`, `size_bytes`, `sha256`, `created_at`, `run_id`). The guard is private per item and exported for the response. |
| `listWorksheets(caseId)` | `GET /api/admin/cases/:caseId/worksheets` through `api()` with `isWorksheetsResponse`. |
| `createPush(requestId, { document_ids })` | `POST /api/admin/requests/:id/logics-push`. The browser never sends `push_again`: a `sent` document cannot be pushed twice (the fingerprint index answers 409 `already_pushed`) and an `unknown` one is resolved only through the dialog (D-04). The Worker route still accepts the field. |
| `resolvePush(pushId, { action, logics_document_id? })` | `POST /api/admin/logics-pushes/:pushId/resolve` with `mark_sent` or `resend` (D-04). |
| `PUSH_ERROR_COPY` | Staff copy per route refusal code (`logics_write_blocked`, `logics_no_credentials`, `already_pushed` (`Already pushed to Logics. Refresh to see its state.`, shown when the ledger on screen was stale), `not_pushable`, `no_items`, `not_resolvable`). For `logics_write_blocked` the sheet shows the Worker's own message instead, because it names the case (`Case 123 is not on the test allowlist`); the entry here is the fallback. Logics' own response bodies never reach the browser (T-05-22). |

All ids are passed through `encodeURIComponent`.
