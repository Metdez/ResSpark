# `app/worker/test/fixtures/logics-push.ts`

Live-test fixtures for the Phase 5 push suites (`logics-push.test.ts`, `logics-rpc.test.ts`).

## Exports

- `PUSH_CASES`: `{ 900001: '…e5', 900002: '…e6' }`, one permanent case of the test firm per suite, each carrying a fake-tenant Logics CaseID. Permanent because `events.case_id` has no `ON DELETE`: a case with events can never be deleted. Separate from the shared `TEST_CASE_ID` so its `logics_case_id` stays NULL for the other suites.
- `TEST_STAFF_UUID`: the staff user id written to `created_by` / `resolved_by` (no FK).
- `sha256hex(bytes)`: node `crypto` SHA-256, lowercase hex.
- `seedPushRequest(admin, { logicsCaseId, docs })`: upserts the test firm and the case (ignore duplicates), inserts a `waiting_on_staff` request with `agent_display_name 'Test agent'`, one `approved` upload item, and for each `{ name, bytes }` uploads the object under the Phase 3 path layout and inserts a `ready` `documents` row with `size_bytes` and `sha256`. Returns `{ case_id, request_id, item_id, document_ids, cleanup }`.
- `cleanup()`: deletes the request's `logics_pushes`, then its `logics_push_batches` (FK order), then `cleanupRequest` removes objects, documents and the request (cascading items). Events stay (test firm only).
- `must(res, what)`: throws with the step name when a supabase-js call fails.
