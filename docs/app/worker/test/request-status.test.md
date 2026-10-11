# `app/worker/test/request-status.test.ts`

Live proof of the request status machine (Plan 03-07; UPL-03, UPL-04, D-05, D-06) against project `zvkphuikjpwoauqdimcf`. It drives `request_status`, `request_apply_status`, `item_approve` and `item_reject` from migration `0004_uploads_review.sql` through `admin.rpc(...)`, plus direct `request_items` and `documents` writes. These are the exact RPCs Plan 03's review routes call.

Run: `pnpm -C app run test:live:file worker/test/request-status.test.ts`. Without `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `CLIENT_LINK_HMAC_KEY` the suite is skipped and `liveEnvOrSkip()` prints which names are missing.

## Fixtures

Seeded through `fixtures/request.ts` under the test firm: request R1 (`opened`, no items at first) and, later, request R2 (one optional `upload` item, `submitted`). `afterAll` calls `cleanupRequest` for each one. The `item.approved` / `item.rejected` events stay because `events` is append-only.

## Helpers

| Helper | Purpose |
|--------|---------|
| `derive(id)` | `rpc('request_status')`, the derived value. |
| `row(id)` | The stored `requests.status` and `completed_at`. |
| `apply(id)` | Calls `rpc('request_apply_status')` and asserts it returns what `request_status` derives and that `requests.status` now holds that value. |
| `setItem`, `addItem`, `addDoc` | Direct writes that stand in for client activity. `addDoc` inserts a `ready` PDF row with a fake `storage_key` (no object exists; cleanup's remove call ignores it). |
| `approve`, `reject` | `rpc('item_approve')` / `rpc('item_reject')` with the test firm by default, actor `staff:test`. |
| `events(id, action)` | Counts the request's events with that action. |

## Cases (run in order; they share R1)

| Case | D-06 / D-05 rule | Asserts |
|------|------------------|---------|
| Empty | "a request with no items never is complete" | R1 with zero items → `opened`, `completed_at` null. |
| Boundary walk | "else opened", "in_progress when any item is in_progress", "waiting_on_staff when any item is submitted" | Two required `pending` items → `opened`; A `in_progress` → `in_progress`; A `submitted` → `waiting_on_staff`. |
| Not submitted | approve guard | `item_approve(B)` while B is `pending` → error `item_not_submitted`, no data. |
| Idempotent approve | UPL-04 | `item_approve(A)` → `{ approved, opened }` and one `item.approved` event; again → `already: true`, still one event. A approved + B pending derives `opened`: approved items do not count as activity under D-06 (see the 03-07 SUMMARY). |
| Complete | "complete when every required item is approved" | B gets a `ready` document and goes `submitted` → `waiting_on_staff`; `item_approve(B)` → `complete`, `completed_at` set. |
| Reject after complete | D-05 | `item_reject(B, 'blurry')` → `in_progress`, `completed_at` null; B has `rejection_note 'blurry'`; its `ready` document is now `rejected` with the same note; one more `item.rejected` event. |
| Blank note | D-05 | `item_reject(B, '   ')` → error `note_required`. |
| Re-complete | adjacency | B `submitted` then approved → `complete` with `completed_at` set again. |
| Optional pending added | adjacency | Insert optional C `pending` → still `complete`, and `completed_at` is unchanged. |
| Cross-firm | T-03-05 | `item_approve` and `item_reject` with a random `p_firm_id` → error `item_not_found`. |
| Zero required | "no required items: complete only when every item is approved" | R2's only (optional) item `submitted` → `waiting_on_staff`; approve → `complete`, `completed_at` set. |
| Ordering | UPL-01/UPL-04 | Two `ready` documents on A with the same `uploaded_at`, inserted higher id first → `listItemDocuments` returns them in `id` order. |
