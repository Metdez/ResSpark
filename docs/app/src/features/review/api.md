# `app/src/features/review/api.ts`

The SPA client for the staff review routes in `app/worker/src/routes/admin-review.ts` (Plan 03-03). The JSON shapes are mirrored here, not imported from the Worker, the same way `features/requests/requests-api.ts` mirrors Phase 2's routes. Every response goes through a type guard before use (the project rule: never cast untrusted JSON).

| Part | What it does |
|------|--------------|
| `REJECT_PRESETS` | The four D-05 note presets, verbatim: `blurry`, `wrong document`, `missing pages`, `need all pages`. The reject dialog renders one button per preset. |
| `Disposition` | `'inline'` (Preview) or `'attachment'` (Download). |
| `ReviewDocument`, `ReviewItem`, `ReviewRequest`, `ClientSessionView`, `ReviewResponse`, `DecisionResponse` | The response shapes. `ReviewRequest` declares only the four fields the SPA reads (`id`, `case_id`, `status`, and `opened_at`, which the mirror card of Plan 03-05 uses); the extra fields the Worker sends are ignored. |
| `str`, `strOrNull` | Small field checks. |
| `isDocument`, `isItem`, `isSession` | Guards for one document, one item (including every nested document), and the client session. |
| `isReviewResponse` | The whole review payload: a request with string `id`/`case_id`/`status` and a string-or-null `opened_at`, an array of valid items, and a session that is `null` or valid. |
| `isUrlResponse` | `{ url, expires_in, disposition }` with `disposition` one of the two values. |
| `isDecisionResponse` | `{ item_status, request_status }`, both strings. |
| `id` | `encodeURIComponent`, applied to every id placed in a path. |
| `fetchReview(requestId)` | `GET /api/admin/requests/:id/review`. |
| `documentUrl(documentId, disposition)` | `GET /api/admin/documents/:id/url?disposition=…`. The URL it returns is used once and never stored. |
| `approve(itemId)` | `POST /api/admin/items/:itemId/approve`. |
| `reject(itemId, note)` | `POST /api/admin/items/:itemId/reject` with `{ note }`. |

All four go through `api()` from `@/lib/api`, which attaches the staff Bearer token and turns an error envelope into an `ApiError { status, code, message }`.

## Address (Plan 06-03)

- `CaseAddressView`: mirrors the Worker's `db/case-address.ts` view.
- `ReviewResponse.address` is optional (`address?: CaseAddressView | null`). The guard accepts a missing key, `null`, or a valid view (`isAddress`: string `line1`, string-or-null text fields, `rdi` of `Residential`/`Commercial`/`null`, boolean `verified`, `source` of `smarty`/`manual`, string `confirmed_at`). A missing key is read as `null` by the panel, so a Worker deployed before this plan still passes the guard.

## Signatures (Plan 06-07, D-20)

- `EsignStage` and `SignatureView` mirror `app/worker/src/db/signature-view.ts`.
- `ReviewResponse.signatures` is optional; the panel reads it as `?? []`, so a response from an older
  Worker still passes the guard.
- `isSignature` checks `item_id` (string), `template_key` (string or null), `configured` (boolean), and
  `connection` as `null` or an object with string `id`/`status`/`stage`, `env` of `test`/`production`, and
  string-or-null `error_code`/`completed_at`. `isReviewResponse` accepts a missing `signatures` or an array
  where every entry passes `isSignature`.
