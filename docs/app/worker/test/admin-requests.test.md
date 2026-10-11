# `app/worker/test/admin-requests.test.ts`

Route tests for templates, draft creation, the list, one request, and send. They run in the `worker-node` Vitest project through `app.request()`. The DB modules (`db/staff`, `db/events`, `db/integrations`, `db/cases`, `db/requests`) are mocked, and Logics runs in `LOGICS_MODE=fake` against the fixture cases. Staff tokens, env, and row builders come from `requests-fixtures.ts`.

## Setup

- `vi.mock` replaces every DB module, so no database is touched.
- `T1` and `T2` are the two seeded template ids. `ITEMS` is the five-item standard packet, `draft()` builds a create body, and `tokenOf()` strips the `http://localhost/c/` prefix from a URL.
- `beforeEach` stubs `fetch` (JWKS only), sets a staff profile in the token's firm, and gives each request mock a default. `afterEach` resets them.

## Templates and drafts

- No token returns 401.
- `GET /templates` returns both templates with their items and reads them for the staff firm.
- `POST /` returns 201 with the request id. `createRequest` receives the staff firm, the staff id as creator, the staff display name as agent, the template name looked up by id, and the items in the posted order (reversed here to prove order is kept).
- Zero items return 400 `no_items`. An unknown kind, a blank or over-long label, a non-boolean `required`, and an array `config` each return 400. `createRequest` is not called for any of them.
- A non-UUID `case_id` returns 400, and an unknown `template_id` returns 404.
- An RPC `case_not_found` returns 404 with that code.
- The same body posted twice calls `createRequest` twice (no dedupe).
- `GET /` returns the mocked list for the staff firm.

## One request

- A sent request returns a link URL under `http://localhost/c/` whose token passes `verifyLinkToken` with an injected finder that returns the link row.
- A revoked link returns `url: null`.
- A request outside the firm returns 404 `not_found`, and a non-UUID id returns 400 before any read.

## Send

- The happy path for fixture case 900001 returns 200 `{ url, expires_at, version: 1 }`. The URL's 64-character token verifies, and `sendRequest` receives the lowercased email, the E.164 phone, and a payload with `contact_overridden: false` and `logics_case_id`.
- `jordan@gmial.com` returns 409 `contact_flagged` with `email_suggestion: 'jordan@gmail.com'`. With `keep_flagged: true` it sends and records `contact_overridden: true`.
- `other@example.com` returns 409 `contact_flagged` with `differs: ['email']`, and with `keep_flagged: true` it sends to that address.
- Empty fields return 400 `contact_invalid` with both field errors. Non-string fields return 400 `bad_request`.
- A cached first name of `Jordana` (Logics says `Jordan`) returns 409 `case_changed` with `first_name` in `changed`. A cached `logics_case_id` that the fixtures do not have returns 409 `case_changed`. `sendRequest` is not called in either case.
- An RPC `request_not_draft` returns 409. Live mode with no tested credentials returns 409 `logics_not_configured`.
- `getStaffProfile` is called once per send, which proves the token is verified once although two sub-apps share the prefix.
- A request outside the firm returns 404.
