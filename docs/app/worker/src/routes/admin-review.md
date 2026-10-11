# `app/worker/src/routes/admin-review.ts`

The staff review API (Plan 03-03; D-05, D-06, D-09, UPL-03, UPL-04), mounted in `index.ts` with `app.route('/api/admin', adminReviewRoute)` after the Phase 2 request routes. `/requests/:id/review` does not overlap Phase 2's `GET /api/admin/requests/:id`, because `:id` there matches a single path segment.

## Contract

| Route | Success | Errors |
|-------|---------|--------|
| `GET /api/admin/requests/:id/review` | 200 `{ request, items, client_session }` (types in `docs/app/worker/src/db/review.md`) | 401, 403, 404 `not_found` |
| `GET /api/admin/documents/:id/url?disposition=inline\|attachment` | 200 `{ url, expires_in: 300, disposition }` | 400 `bad_request` (unknown disposition), 401, 403, 404 `not_found` |
| `POST /api/admin/items/:itemId/approve` | 200 `{ item_status, request_status }` | 401, 403, 404 `not_found`, 409 `item_not_submitted` |
| `POST /api/admin/items/:itemId/reject` body `{ note }` | 200 `{ item_status, request_status }` | 400 `note_required` / `note_too_long`, 401, 403, 404, 409 `item_not_submitted` |

Errors use the app-wide envelope `{ error: { code, message } }` from `app.onError` (the routes throw `HTTPException(status, { message: code })`).

## Code

| Part | What it does |
|------|--------------|
| `UUID`, `idParam(c, name)` | A path id that is not a UUID gets the same 404 as a missing or foreign one. It never reaches Postgres, where it would be a cast error (500). |
| `EXPIRES_IN` | 300 seconds. Signed URLs are minted per click and never stored or logged (D-05, ARCHITECTURE § 7). |
| `MAX_NOTE` | 500 characters, after trimming. |
| `fail(status, code)` | Builds the `HTTPException` that `app.onError` turns into the envelope and records as `errorCode` for the logger. |
| `toHttp(e)` | A `ReviewError` from `db/review.ts` becomes `fail(e.status, e.code)`. Anything else is rethrown and becomes onError's generic 500. |
| `.use('*', staffAuth)` | Every route needs a verified staff JWT; `c.var.staff.firmId` scopes every query and `c.var.staff.userId` is the actor of every event. When a sibling route already verified the token, `staffAuth` skips. |
| `GET /requests/:id/review` | `getFirmRequest` (404 when `null`), then items with documents and the latest client session in parallel. |
| `GET /documents/:id/url` | `disposition` defaults to `inline`; any other value than `inline`/`attachment` → 400 before any lookup. The document must belong to the staff member's firm and be `ready` or `rejected` (an `uploading` or `deleted` row → 404). `inline` is kept only for the three types the upload sniff accepted (`ACCEPTED_MIMES`: PDF, JPEG, PNG); any other stored type is downgraded to `attachment`. `attachment` signs with `download: <original file name>`, so Storage sends `Content-Disposition: attachment` with that name; `inline` signs with `download: false`. The view is then logged as `document.viewed` with `{ document_id, disposition }`. That goes through `logEvent` (the `log_event` RPC) rather than a dedicated RPC, because nothing changes state. The URL itself is never put in the event or a log line. |
| `POST /items/:itemId/approve` | Calls `approveItem` (the `item_approve` RPC) and returns only `item_status` and `request_status`. The RPC's `already` flag is dropped: a second approve is a quiet success. |
| `POST /items/:itemId/reject` | Reads `note` from the JSON body. A missing, non-string or blank note → 400 `note_required`; over 500 characters after trimming → 400 `note_too_long`. Neither calls the RPC. Otherwise `rejectItem` with the trimmed note. |

## Why only the RPCs decide

The Worker never writes `request_items.status` directly. `item_approve` and `item_reject` lock `requests` and then the item, write the `item.approved` / `item.rejected` event, and recompute `requests.status` with `request_status()`, all in one transaction (T-03-15). Two staff approving at once therefore produce one event, and an approve racing a client's upload `complete` waits on the same row lock.

## Signed URL caveat (T-03-13)

The signed URL is valid for 5 minutes and opens in a new tab with `noopener`; the SPA never renders it in an `<iframe>` or `<img>` (T-03-16). Supabase's Smart CDN may keep serving a cached response for a short time after the token expires. That is accepted for the demo.

## Address on the review response (Plan 06-03, D-07)

`GET /requests/:id/review` also returns `address`: `getCaseAddress(env, request.case_id)` runs in the same `Promise.all` as the items and the client session, after `getFirmRequest` has scoped the request to the staff firm. It is a `CaseAddressView` (see `db/case-address.md`) or `null` when the client has not confirmed an address. No other handler changed. The test file mocks `../db/case-address` and checks both the value and the `null` case, and that it is called with the request's `case_id`.

## Signatures on the review response (Plan 06-07, D-20)

`GET /requests/:id/review` also returns `signatures`: `listRequestSignatures(env, firmId, request.id)`
runs in the same `Promise.all` as the items, client session and address, after `getFirmRequest` scoped the
request to the staff firm. It is a `SignatureView[]` (see `db/signature-view.md`): one entry per
`signature` item with its template key, whether e-sign is set up for it, and the latest DocuSeal
connection's stage. It never carries the signing slug or the vendor submission id.
