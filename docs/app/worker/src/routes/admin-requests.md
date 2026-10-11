# `app/worker/src/routes/admin-requests.ts`

The staff request API for templates, drafts, the list, and one request (REQ-01, D-06, D-15, D-17). It is mounted in `index.ts` at `/api/admin/requests`, and every path runs behind `staffAuth`. The file also exports the small helpers that `admin-request-actions.ts` reuses.

| Lines | What it does |
|-------|--------------|
| 1-8 | Hono and its `Context` type, `HTTPException`, `isEsignTemplateKey` (Plan 06-05, `src/lib/esign-templates.ts`), the Phase 1 link primitives (`hmacKey`, `mintLinkToken`, `uuidToBytes`), the dashboard list reader and its helpers (`DASHBOARD_STATUSES`, `listDashboardRequests`, `sanitizeQuery`, Phase 3 Plan 04), the request DB helpers, the RPC token list, and `staffAuth`. |
| 10 | `AdminApp`: the Hono generics shared by both request route files. `staff` is always set inside handlers, and `errorCode` lets a handler that answers with `c.json` still report its code to the logger. |
| 12-19 | `KINDS`: the six item kinds. `satisfies` keeps the list in step with `ItemKind`. |
| 20-21 | The UUID shape for ids, and `MAX_ITEMS`, a sanity cap on posted items. |
| 23-31 | `RPC_STATUS`: the HTTP status for each RAISE token from migration 0003. |
| 33-34 | `badRequest()` (400 `bad_request`) and `notFound()` (404 `not_found`). |
| 36-42 | `rpcToHttp`: an `Error` whose message is an RPC token becomes an `HTTPException` with that code, except `request_not_found`, which becomes `not_found`. Anything else is returned unchanged, and `onError` turns it into 500 `internal`. |
| 44-47 | `readBody`: the JSON body as an object, or `{}` for a missing, non-JSON, or array body. It never throws. |
| 49-53 | `requestIdParam`: the `:id` path param, or 400 when it is not a UUID, before any read. |
| 55-64 | `linkUrl`: the copyable client URL. It returns null when the link is revoked or its `expires_at` is in the past (so staff never copy or email a dead link; the email action then reports `no_link`); otherwise it mints `base64url(link_id ‖ HMAC(link_id ‖ version))` with `CLIENT_LINK_HMAC_KEY` and prefixes the Worker's own origin plus `/c/`. The URL is rebuilt for every response and never stored or logged (D-17). |
| 66-76 | `isConfig` and `parseItem`: one posted item is valid when `kind` is one of the six, `label` is a non-blank string of at most 120 characters, `required` is a boolean, and `config` is a plain object. The item is rebuilt from those four keys, so extra keys never reach the RPC. The label is trimmed. |
| 78-79 | The route instance, with `staffAuth` on every method and path. |
| 80 | `GET /templates`: the global and firm templates. It is registered before `/:id`, so `templates` is never read as an id. |
| 81-109 | `POST /`: `case_id` and `template_id` must be UUIDs and `items` an array. An empty array returns 400 `no_items` and an invalid item returns 400 `bad_request`. A `signature` item whose `config.template` is not `engagement_letter`, `form_2848`, or `form_8821` (`isEsignTemplateKey`) returns 400 `bad_template` before any read, so no request can carry a Form 433-A or any other form (Plan 06-05, D-01); other kinds are not checked. The template name is looked up from the firm's visible templates by id, and an unknown id returns 404 `not_found`. `createRequest` receives the firm, creator, and agent display name from the verified staff context. The route returns 201 `{ request_id }`. RPC tokens map through `rpcToHttp`, so a case outside the firm returns 404 `case_not_found`. |
| 110-117 | `GET /`: the one list handler for this path (D-07, STAT-01). It serves both the Phase 3 dashboard and the Phase 2 `/admin/requests` page. `?status=` must be one of `DASHBOARD_STATUSES`, otherwise the route returns 400 `bad_request` before any read. `draft` is not in the list, so it is refused too. `?q=` goes through `sanitizeQuery`, and a value that sanitizes to empty counts as no search. The route then calls `listDashboardRequests(env, staff.firmId, { status, q })` and returns `{ requests }`. Each row still carries the Phase 2 keys (`id`, `status`, `client_name`, `sent_at`, `expires_at`, `created_at`), so `isRequestList` on the Phase 2 page accepts it. Rows are newest activity first, and drafts are left out. |
| 118-150 | `GET /:id`: the firm-scoped request. A request outside the firm returns 404 `not_found`. The response holds the request fields, the case identity (`case_id`, `logics_case_id`, names, email, `phone_e164`), the items in `position` order, and the link block `{ url, version, expires_at, revoked_at, opened_at }`. The link block is null before send, and its `url` is null once the link is revoked or expired. |

## Security

- Firm and actor come only from the verified JWT (`c.var.staff`). The body contributes ids and item content, all shape-checked.
- The list's `status` is checked against an allowlist, and `q` is reduced to `[A-Za-z0-9@._'\- ]` (64 characters at most) before it is placed in the PostgREST `or(...)` filter (T-03-17).
- The token is minted on the fly and never written to a table, event, or log line.

## Tests

`app/worker/test/admin-requests.test.ts`.
