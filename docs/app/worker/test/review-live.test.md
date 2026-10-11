# `app/worker/test/review-live.test.ts`

Live proof of `app/worker/src/db/review.ts` against the Supabase project (Plan 03-03). The unit tests mock these functions, so this file is what proves the PostgREST embeds, the firm joins and the RPC error mapping on the real schema. Run it with `pnpm -C app run test:live:file worker/test/review-live.test.ts`. It skips, naming the missing variables, when `SUPABASE_URL`, `SUPABASE_SECRET_KEY` or `CLIENT_LINK_HMAC_KEY` is absent.

## Fixtures

- `seedRequest` (from `fixtures/request.ts`) creates an `opened` request under the test firm with two upload items and a client link. Item 1 starts `submitted` (required); item 2 stays `pending` (optional).
- Three `documents` rows on item 1, inserted directly with the same `uploaded_at`: `a.pdf` and `b.pdf` (`ready`) and `c.pdf` (`uploading`). No Storage objects are created.
- One `client_sessions` row for the link with `last_step: 'upload'`.
- `OTHER_FIRM` (`...0000ff`) is a firm id that owns nothing; it stands in for "another firm".
- `afterAll` runs `cleanupRequest`, which deletes the documents and the request (cascading items, link and session). The fixed test case and its append-only events stay, as in `uploads.test.ts`.

## Cases

| Case | Proves |
|------|--------|
| scopes the request to its firm | `getFirmRequest` returns the row for the test firm and `null` for another firm. |
| lists items by position… | Items come back in position order; the embedded `documents` filter drops the `uploading` row; two documents with equal `uploaded_at` are ordered by `id`; an item without files has `documents: []` (the filter on the embedded table does not drop the item). |
| returns the latest client session | The `client_links!inner` join finds the session through the request. |
| finds a document only through its own firm | The two-level `request_items → requests` inner join returns `firm_id` and `request_id`, and drops the row for another firm. |
| maps the RPC tokens | Approving a `pending` item → `ReviewError('item_not_submitted', 409)`; approving with another firm id → `ReviewError('not_found', 404)`. |
| rejects… then approves it once | `item_reject` marks the item and both `ready` documents `rejected` with the note `blurry`. The first approve returns `approved`; the second returns `already: true`; the item's note is cleared; exactly one `item.approved` event exists. |
| lists the case events newest first… | This request's two newest events are `item.approved` then `item.rejected`, every timestamp is in descending order, and another firm gets `null`. |
