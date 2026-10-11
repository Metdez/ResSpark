# `app/worker/src/routes/admin-request-actions.ts`

The staff actions on one request (D-05, D-07, D-08, D-09, LOOK-04, REQ-02, REQ-03, REQ-05). It is mounted in `index.ts` at `/api/admin/requests`, after `admin-requests.ts`, and every path runs behind `staffAuth`. Because `staffAuth` skips its work when `staff` is already set, the token is verified once per request even though both sub-apps declare it.

## Imports and helpers

- **Imports:** Hono, the shared `checkContact` and `normalizePhone` from `app/src/lib/contact.ts` (the same code the SPA form runs), the case row type, `getIntegration`, `logEvent`, the request DB helpers and `RequestRow`, `resolveLogicsClient` and `fetchCaseSummary` (Plan 02), `staffAuth`, the Logics error mapper `toHttp` from `admin-lookup.ts` (imported as `logicsToHttp`), and the helpers exported by `admin-requests.ts`.
- **`norm`:** trims and lowercases a possibly-null string, so null and `''` compare equal.
- **`refuse`:** answers with the standard envelope `{ error: { code, message } }` plus extra fields that let the SPA explain the refusal (field errors, the suggestion, the changed fields). It sets `errorCode` so the logger records the code.
- **`loadRequest`:** a firm-scoped `getRequest`. A non-UUID id returns 400, and a request outside the firm returns 404 `not_found`.
- **`staffEvent`:** the common event fields (firm, case, request, `actor_type: 'staff'`, and the staff user id from the verified JWT), so every event this file writes names its actor (T-02-24).
- **`changedFields`:** compares the cached case with a fresh `Case/CaseInfo` summary. It checks first and last name (trimmed, case-insensitive), email (case-insensitive), and phone. The fresh phone is the first present of cell, home, and work, normalized with `normalizePhone` to E.164, exactly as the confirm route did when it stored `cases.phone_e164`. Both sides therefore carry the `+1`, so the comparison cannot fail on format alone.

## `POST /:id/send`

Body `{ email, phone, keep_flagged? }`. The steps run in this order:

1. Load the request. A case without a `logics_case_id` returns 409 `case_changed` with `changed: ['logics_case_id']`.
2. `email` and `phone` must be strings and `keep_flagged` a boolean when present; otherwise 400 `bad_request`.
3. `checkContact` runs server-side. An invalid email or phone returns 400 `contact_invalid` with `email_error` and `phone_error`.
4. The flags are the did-you-mean suggestion and `differs`, which lists `email` and/or `phone` when the value differs from the one Logics holds for the case. If any flag is set and `keep_flagged` is not `true`, the route returns 409 `contact_flagged` with `email_suggestion` and `differs`. One acknowledgement covers both flags, so the UI needs a single "Use this value anyway" control.
5. It re-reads the case from Logics through fixtures or the live client. A Logics failure maps as in the lookup route: 409 `logics_not_configured`, or 502 `logics_unauthorized` / `logics_unreachable`. A case Logics no longer returns gives 409 `case_changed` with `changed: ['case']`, and any changed field gives 409 `case_changed` with the list. The cached snapshot is never the send-time source (C8, T-02-18).
6. `sendRequest` stores the validated contact and logs `request.sent` with `{ to_email, to_phone_e164, contact_overridden, logics_case_id }`. `contact_overridden` is true only when staff kept a flagged value. RPC tokens map through `rpcToHttp`, so a request that is no longer a draft returns 409 `request_not_draft`.
7. The route returns `{ url, expires_at, version }`, where `url` is minted from the new link row by `linkUrl`.

## `POST /:id/regenerate`

Loads the request (404 outside the firm). `regenerateLink` then bumps the link `version` and resets the expiry to 14 days, and tokens minted for the old version stop verifying. A revoked or draft request returns 409 `request_not_active`. The route returns `{ url, expires_at, version }` for the new version. Two concurrent regenerates each bump the version, because the RPC locks the request row. The later one wins and both are logged.

## `POST /:id/revoke`

Loads the request, then `revokeRequest` sets `revoked_at` on the link and `revoked` on the request. A second revoke returns 409 `request_revoked`. The route returns `{ ok: true }`, and `GET /:id` then shows `url: null`.

## `POST /:id/consent`

Body `{ agreed: true }`. Only the literal boolean `true` counts. `false`, the string `"true"`, or a missing field returns 400 `bad_request`, and nothing is logged. The route writes one `consent.sms` event per call, with the staff user as actor and `{ phone_e164 }` as payload. The number is the contact stored at send time, or the case phone before send. The platform never sends an SMS: "send by text" is a copy action the agent completes from their own phone (M1). The route returns `{ ok: true, event_id }`.

## `POST /:id/copied`

Reads no body. It writes one `request.link_copied` event per call, with the staff user as actor and an empty payload, so a copy is recorded whether or not email is configured (D-09). It returns `{ ok: true, event_id }`.

## Security

- The recipient stored on the request is the validated, lowercased email and the E.164 phone. It is never a raw body value.
- No token or URL is stored or logged.
- Nothing in this file calls `fetch`. Outbound calls live in the integrations modules.

## Tests

`app/worker/test/admin-requests.test.ts` (send) and `app/worker/test/admin-request-actions.test.ts` (regenerate, revoke, consent, copied).
