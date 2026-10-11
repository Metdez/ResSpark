# `app/worker/src/routes/admin-review.test.ts`

Unit tests for `admin-review.ts`, run in the `worker-node` Vitest project through `app.request()`. No network.

## Mocks

| Module | Mocked as | Why |
|--------|-----------|-----|
| `../auth/staff-jwt` | `verifyStaffJwt` resolves `{ sub: 'U1', app_metadata: { firm_id: 'F1' } }` | `staffAuth` itself stays real, so a request without `authorization` still gets its 401. |
| `../db/staff` | `getStaffProfile` resolves firm `F1`, role `staff` | Completes the real `staffAuth` check. |
| `../db/events` | `logEvent` | Asserts the `document.viewed` event. |
| `../db/review` | every query function; `ReviewError` is the real class | Lets a test throw `new ReviewError('item_not_submitted', 409)` exactly as the RPC wrapper would. |
| `../storage/case-documents` | only `signedReadUrl`; `ACCEPTED_MIMES` stays real | Asserts the `download` and `expiresIn` options. |

`R1`, `D1`, `I1` are fixed UUIDs because the routes refuse non-UUID ids with 404.

## Cases

- Review read: the request, the items with nested documents in the order the query returned them, and the client session; 404 for a foreign request and for a malformed id; 401 with no token, before any query.
- Document URL: inline photo → `{ url, expires_in: 300, disposition: 'inline' }`, `signedReadUrl(…, { download: false, expiresIn: 300 })`, and one `document.viewed` event with the exact staff actor and payload; attachment → `download: 'My ID.jpg'`; `application/octet-stream` asked inline → `attachment`; unknown disposition → 400 with nothing signed; foreign document or an `uploading` one → 404 with no event.
- Approve: 200 with the RPC's statuses and the call `(env, 'F1', I1, 'U1')`; `item_not_submitted` → 409 envelope; `not_found` → 404.
- Reject: blank note → 400 `note_required` with no RPC call; 501 characters → 400; `' blurry '` → the RPC gets `'blurry'`.
