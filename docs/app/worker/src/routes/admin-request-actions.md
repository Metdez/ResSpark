# `app/worker/src/routes/admin-request-actions.ts`

The staff actions on one request (D-05, D-07, D-08, LOOK-04, REQ-02). It is mounted in `index.ts` at `/api/admin/requests`, after `admin-requests.ts`, and every path runs behind `staffAuth`. Because `staffAuth` skips its work when `staff` is already set, the token is verified once per request even though both sub-apps declare it.

## Imports and helpers

- **Imports:** Hono, the shared `checkContact` and `normalizePhone` from `app/src/lib/contact.ts` (the same code the SPA form runs), the case row type, `getIntegration`, the request DB helpers, `resolveLogicsClient` and `fetchCaseSummary` (Plan 02), `staffAuth`, the Logics error mapper `toHttp` from `admin-lookup.ts` (imported as `logicsToHttp`), and the helpers exported by `admin-requests.ts`.
- **`norm`:** trims and lowercases a possibly-null string, so null and `''` compare equal.
- **`refuse`:** answers with the standard envelope `{ error: { code, message } }` plus extra fields that let the SPA explain the refusal (field errors, the suggestion, the changed fields). It sets `errorCode` so the logger records the code.
- **`loadRequest`:** a firm-scoped `getRequest`. A non-UUID id returns 400, and a request outside the firm returns 404 `not_found`.
- **`changedFields`:** compares the cached case with a fresh `Case/CaseInfo` summary. It checks first and last name (trimmed, case-insensitive), email (case-insensitive), and phone. The fresh phone is the first present of cell, home, and work, normalized with `normalizePhone` to E.164, exactly as the confirm route did when it stored `cases.phone_e164`. Both sides therefore carry the `+1`, and a raw-digit comparison cannot refuse every send.

## `POST /:id/send`

Body `{ email, phone, keep_flagged? }`. The steps run in this order:

1. Load the request. A case without a `logics_case_id` returns 409 `case_changed` with `changed: ['logics_case_id']`.
2. `email` and `phone` must be strings and `keep_flagged` a boolean when present; otherwise 400 `bad_request`.
3. `checkContact` runs server-side. An invalid email or phone returns 400 `contact_invalid` with `email_error` and `phone_error`.
4. The flags are the did-you-mean suggestion and `differs`, which lists `email` and/or `phone` when the value differs from the one Logics holds for the case. If any flag is set and `keep_flagged` is not `true`, the route returns 409 `contact_flagged` with `email_suggestion` and `differs`. One acknowledgement covers both flags, so the UI needs a single "Use this value anyway" control.
5. It re-reads the case from Logics through fixtures or the live client. A Logics failure maps as in the lookup route: 409 `logics_not_configured`, or 502 `logics_unauthorized` / `logics_unreachable`. A case Logics no longer returns gives 409 `case_changed` with `changed: ['case']`, and any changed field gives 409 `case_changed` with the list. The cached snapshot is never the send-time source (C8, T-02-18).
6. `sendRequest` stores the validated contact and logs `request.sent` with `{ to_email, to_phone_e164, contact_overridden, logics_case_id }`. `contact_overridden` is true only when staff kept a flagged value. RPC tokens map through `rpcToHttp`, so a request that is no longer a draft returns 409 `request_not_draft`.
7. The route returns `{ url, expires_at, version }`, where `url` is minted from the new link row by `linkUrl`.

## Security

- The recipient stored on the request is the validated, lowercased email and the E.164 phone. It is never a raw body value.
- No token or URL is stored or logged.

## Tests

`app/worker/test/admin-requests.test.ts` (send).
