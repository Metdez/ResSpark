# `app/worker/src/routes/admin-requests.ts`

The staff request API for templates, drafts, the list, and one request (REQ-01, D-06, D-15, D-17). It is mounted in `index.ts` at `/api/admin/requests`, and every path runs behind `staffAuth`. The file also exports the small helpers that `admin-request-actions.ts` reuses.

| Lines | What it does |
|-------|--------------|
| 1-6 | Hono and its `Context` type, `HTTPException`, the Phase 1 link primitives (`hmacKey`, `mintLinkToken`, `uuidToBytes`), the request DB helpers, the RPC token list, and `staffAuth`. |
| 8 | `AdminApp`: the Hono generics shared by both request route files. `staff` is always set inside handlers, and `errorCode` lets a handler that answers with `c.json` still report its code to the logger. |
| 10-17 | `KINDS`: the six item kinds. `satisfies` keeps the list in step with `ItemKind`. |
| 18-19 | The UUID shape for ids, and `MAX_ITEMS`, a sanity cap on posted items. |
| 21-29 | `RPC_STATUS`: the HTTP status for each RAISE token from migration 0003. |
| 31-32 | `badRequest()` (400 `bad_request`) and `notFound()` (404 `not_found`). |
| 34-40 | `rpcToHttp`: an `Error` whose message is an RPC token becomes an `HTTPException` with that code, except `request_not_found`, which becomes `not_found`. Anything else is returned unchanged, and `onError` turns it into 500 `internal`. |
| 42-45 | `readBody`: the JSON body as an object, or `{}` for a missing, non-JSON, or array body. It never throws. |
| 47-51 | `requestIdParam`: the `:id` path param, or 400 when it is not a UUID, before any read. |
| 53-61 | `linkUrl`: the copyable client URL. It returns null when the link is revoked; otherwise it mints `base64url(link_id ‖ HMAC(link_id ‖ version))` with `CLIENT_LINK_HMAC_KEY` and prefixes the Worker's own origin plus `/c/`. The URL is rebuilt for every response and never stored or logged (D-17). |
| 63-73 | `isConfig` and `parseItem`: one posted item is valid when `kind` is one of the six, `label` is a non-blank string of at most 120 characters, `required` is a boolean, and `config` is a plain object. The item is rebuilt from those four keys, so extra keys never reach the RPC. The label is trimmed. |
| 75-76 | The route instance, with `staffAuth` on every method and path. |
| 77 | `GET /templates`: the global and firm templates. It is registered before `/:id`, so `templates` is never read as an id. |
| 78-103 | `POST /`: `case_id` and `template_id` must be UUIDs and `items` an array. An empty array returns 400 `no_items` and an invalid item returns 400 `bad_request`. The template name is looked up from the firm's visible templates by id, and an unknown id returns 404 `not_found`. `createRequest` receives the firm, creator, and agent display name from the verified staff context. The route returns 201 `{ request_id }`. RPC tokens map through `rpcToHttp`, so a case outside the firm returns 404 `case_not_found`. |
| 104 | `GET /`: the firm's requests, newest first. |
| 105-137 | `GET /:id`: the firm-scoped request. A request outside the firm returns 404 `not_found`. The response holds the request fields, the case identity (`case_id`, `logics_case_id`, names, email, `phone_e164`), the items in `position` order, and the link block `{ url, version, expires_at, revoked_at, opened_at }`. The link block is null before send, and its `url` is null once the link is revoked. |

## Security

- Firm and actor come only from the verified JWT (`c.var.staff`). The body contributes ids and item content, all shape-checked.
- The token is minted on the fly and never written to a table, event, or log line.

## Tests

`app/worker/test/admin-requests.test.ts`.
