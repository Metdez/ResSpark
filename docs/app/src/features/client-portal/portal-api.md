# `app/src/features/client-portal/portal-api.ts`

The client portal's own fetch wrapper for the Worker's `/api/c/*` routes (Plan 02-07). It exists so the client bundle never imports the admin `api()` (`@/lib/api`) or supabase-js (`@/lib/supabase`). A client has no staff token, only the HttpOnly `rs_client` cookie the Worker set when the link was opened.

## Types

- `StepKind`: the six `request_items.kind` values (`bank_connect`, `payroll_connect`, `address`, `upload`, `signature`, `intake`). Mirrored from the Worker, not imported.
- `StepStatus`: `pending`, `in_progress`, `submitted`, `approved`, `rejected`.
- `PortalStep` / `PortalState`: the allow-listed DTO of `GET /api/c/state` (firm name, agent name, request status, `opened_at`, `expires_at`, steps). No contact fields and no case or request ids reach the browser.
- `PortalError(status, code)`: every non-2xx answer, plus `invalid_response` (status 500) when a 200 body fails its guard. The Worker's uniform session failure is `PortalError(401, 'no_session')`.
- `HeartbeatBody`: `last_step`, an optional fixed `last_error` code (`state_failed`, `start_failed`, or an `UploadErrorCode` from `features/uploads/copy`; never free text. The Worker stores up to 200 characters with no allowlist), and `user_agent_class` (`phone`, `tablet`, `desktop`).

## Functions

| Symbol | What it does |
|--------|--------------|
| `isPortalState` | Type guard: checks all six top-level keys and the six keys of every step. Untrusted JSON is never cast. |
| `portalFetch(path, init, guard)` | `fetch` with `credentials: 'same-origin'` (send the cookie), `content-type: application/json`, and `X-Requested-With: ResSpark` (the Worker's CSRF header; POSTs without it get 403 `bad_origin`). Caller headers come last. A non-2xx answer throws `PortalError` with the envelope's `error.code` (or `http_error`); a body that fails `guard` throws `invalid_response`. No `authorization` header is ever sent. |
| `getState()` | `GET /api/c/state` returns `PortalState`. Never marks the request opened. |
| `start()` | `POST /api/c/start` returns `{ opened_at }`. The only call that opens the request (PORT-02); idempotent on the Worker. |
| `heartbeat(body)` | `POST /api/c/heartbeat`. Never rejects. Returns `'ok'`, `'rate_limited'` (a 429, so `useHeartbeat` skips its next tick), or `'failed'` (any other error, including a network error). A lost heartbeat only delays the staff-side "last seen". |

## Tests

`portal-api.test.ts` stubs `fetch` and checks that the state call uses the cookie and no bearer token, `start` posts with the CSRF header, a 401 becomes `PortalError` `no_session`, a bad 200 body becomes `invalid_response`, the guard checks step keys, and `heartbeat` posts its body and maps a 429 and a network error without rejecting.
