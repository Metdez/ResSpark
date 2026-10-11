# `app/worker/test/fixtures/request.ts`

The one seeding and cleanup path for the live Phase 3 suites (`uploads.test.ts`, `request-status.test.ts`; Plan 03-07). It writes only under the dedicated test firm, so ValorTax staff never see these rows (every admin query is firm-scoped).

## Exports

| Export | What it does |
|--------|--------------|
| `TEST_FIRM_ID` | `00000000-0000-0000-0000-00000000000e`, named `Test firm (automated)`. |
| `TEST_CASE_ID` | `00000000-0000-0000-0000-0000000000e1`, the permanent case under the test firm. It is never deleted: `events` is append-only and `events.case_id` has no `ON DELETE`, so a case with events cannot be removed. |
| `liveEnvOrSkip()` | Returns `{ url, secret, hmac }` from `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `CLIENT_LINK_HMAC_KEY`. When any is missing it prints `live suite skipped: missing <names>` (names only, never values) and returns `null`; suites pass the result to `describe.skipIf`. |
| `seedRequest(admin, opts)` | Upserts the firm and the case if missing, inserts a `requests` row (`template_name 'test'`; `status` defaults to `opened`; `sent_at` is set unless `draft`, `opened_at` only for `opened`), then the `request_items` in array order with `position` 1..N (`status` defaults to `pending`). With `withLink: true` it inserts a `client_links` row with the same columns and 14-day expiry that `createClientLink` writes. Returns `{ firm_id, case_id, request_id, item_ids, link_id, link_version }`; `item_ids` follows `position` order. |
| `cleanupRequest(admin, { request_id })` | Finds the request's items, removes the Storage objects named by their `documents.storage_key`, deletes those `documents` rows, then deletes the request, which cascades its `request_items`, `client_links` and `client_sessions`. |

## Why cleanup is scoped to the request

Both live suites share the permanent test case and Vitest runs files in parallel. Deleting by case (the Plan 01 approach) would let one suite's `afterAll` remove the other's documents mid-run. Scoping by the request's item ids keeps the suites independent. `documents.request_item_id` is `ON DELETE SET NULL`, so the documents must go before the request.

## Errors

`must(...)` throws `<step>: <PostgREST message>` when a seed or delete returns an error, so a failed seed stops the suite in `beforeAll` instead of producing confusing assertion failures later.
