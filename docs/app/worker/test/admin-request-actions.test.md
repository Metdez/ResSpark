# `app/worker/test/admin-request-actions.test.ts`

Route tests for the link lifecycle and the event-only actions on one request. They run in the `worker-node` Vitest project through `app.request()`. Every DB module is mocked, and staff tokens, env, and row builders come from `requests-fixtures.ts`.

## Setup

- `vi.mock` replaces `db/staff`, `db/events`, `db/integrations`, `db/cases`, and `db/requests`.
- `action(name, body, opts)` posts to `/api/admin/requests/<REQ>/<name>`. `staffEvent` holds the event fields every staff action must carry.
- `beforeEach` stubs `fetch` and keeps the stub for outbound checks. The email tests use a fake Cloudflare Email Service binding instead (`binding()` records each message; `binding(code)` throws an error with that `code`). It returns a request already sent to the fixture contact, a regenerate result at version 2, and event id 41.

## Regenerate

- 200 with version 2. The returned token verifies against a link row at version 2 and fails against version 1, which shows old links stop working. `regenerateLink` receives the staff firm and the staff id.
- An RPC `request_not_active` returns 409.

## Revoke

- 200 `{ ok: true }`, and `revokeRequest` receives the staff id.
- An RPC `request_revoked` (a second revoke) returns 409.

## Consent

- `{ agreed: true }` returns 200 `{ ok: true, event_id }` and logs `consent.sms` with the staff actor and `{ phone_e164: '+15550100001' }`.
- Two calls log two events.
- `{ agreed: false }`, `{ agreed: 'true' }`, and `{}` each return 400 `bad_request` with nothing logged.

## Copied

- Returns 200 and logs `request.link_copied` with the staff actor and an empty payload. Two calls log two events.
- Consent and copied make no outbound `fetch`.

## Email

- With the binding and `EMAIL_FROM` set and the binding answering `{ messageId: "em_1" }`, the route returns `{ ok: true, id: "em_1" }`. The message `to` is `jordan.rivera@example.com` even though the body posts `to: attacker@example.com`, and `request.email_sent` is logged with `{ to, message_id }`.
- Without a key it returns `not_configured` and makes no outbound call.
- Without `EMAIL_FROM` the route returns `not_configured` and sends nothing.
- An `E_DELIVERY_FAILED` error returns `send_failed` and logs `request.email_failed` with `{ to, reason }`.
- A revoked link and a missing link each return `no_link` without sending.
- A request outside the firm returns 404.

## Firm scoping

- Regenerate, revoke, consent, and copied each return 404 for a request outside the firm, with no RPC called and nothing logged.

## `step` on the email route (Plan 06-07)

With a request carrying one `signature` and one `upload` item: `{ step: <signature id> }` sends a text
body whose link line ends with `?step=<id>`; an upload item, another request's item id, a non-UUID, or a
number is 400 `bad_request` with no send and no event; no body keeps the Phase 2 URL (no `?step=`).
