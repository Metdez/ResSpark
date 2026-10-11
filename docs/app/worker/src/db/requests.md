# `app/worker/src/db/requests.ts`

Database access for request templates, requests, their items, and their client link (D-06, D-08, D-15). Every state change goes through one of the migration 0003 RPCs, which writes its `events` row in the same transaction. Reads filter by `firm_id` first (Pattern 2), so another firm's id reads as "not found". The Worker's service-role client is the only caller.

| Lines | What it does |
|-------|--------------|
| 1-3 | `getCase` and `CaseRow` (the case cache from Plan 03), the per-request admin client, and `rpcErrorToken`, which pulls a bare RAISE token out of a Postgres error. |
| 5 | `DbEnv`: only the two Supabase bindings are needed. |
| 7 | `ItemKind`: the six item kinds allowed by the `request_items.kind` CHECK. |
| 9-20 | `TemplateItem` (`kind`, `label`, `required`, `config`) and `Template` (`id`, `name`, `items`), the shape of `request_templates` rows and of the items posted when a draft is created. |
| 22-34 | `RequestRow`: the `requests` columns the routes read. `contact_email` and `contact_phone_e164` are the destination staff confirmed at send time and stay null on a draft. |
| 36-45 | `RequestItemRow`: one `request_items` row. |
| 47-53 | `LinkRow`: the `client_links` fields the staff UI needs. There is no token or URL column; the URL is minted per response (D-17). |
| 55-61 | `RequestBundle`: what `getRequest` returns, which is the request, its cached case, its items, its link (or null before send), and the firm name for the email copy. |
| 63-70 | `RequestListRow`: one row of the request list. |
| 72-76 | `IssuedLink`: the `(link_id, version, expires_at)` row returned by `request_send` and `request_regenerate_link`. |
| 78-79 | The `requests` column list read by `getRequest`. |
| 81 | `fail`: turns a Supabase error into `Error(token)` when the RPC raised a known token (`case_not_found`, `request_not_draft`, …), else `Error(fallback)`. The Postgres message text never leaves this module. |
| 83-88 | `firstRow`: the link RPCs return `TABLE (...)`, which PostgREST sends as a one-element array. An empty array is a failure. |
| 90-99 | `getTemplates`: global templates (`firm_id IS NULL`) plus the firm's own, ordered by name. The firm id comes from the verified staff context, never the request. |
| 101-123 | `createRequest`: calls `request_create`, which refuses zero items (`no_items`) and a case outside the firm (`case_not_found`), inserts the items at positions 1..N in array order, and logs `request.created`. Returns the new request id. There is no dedupe: the same body twice makes two drafts. |
| 125-136 | `ListRaw`, `OneOrMany`, and `one`: the embedded `cases` and `client_links` relations are to-one, but the untyped client may hand them back as arrays, so `one` takes the first element in that case. |
| 138-158 | `listRequests`: the firm's 200 newest requests, joined to the case (`cases!inner`) for the client name and to the link for its expiry. A case with no name shows as `Unknown client`. |
| 160-195 | `getRequest`: the firm-scoped request row, then in parallel the items ordered by `position`, the link row (also firm-scoped), the firm name, and the cached case. Returns null when the request is not in the firm. Any read error becomes `request_lookup_failed`. |
| 197-218 | `sendRequest`: calls `request_send`, which locks the request, requires `draft` (`request_not_draft`), creates the single `client_links` row at version 1 with a 14-day expiry, stores the contact on the request, sets `sent`, and logs `request.sent` with the given payload. |
| 220-231 | `regenerateLink`: calls `request_regenerate_link`, which requires an active request (`request_not_active`), bumps `version` (old tokens stop verifying), resets the expiry to 14 days, and logs `request.link_regenerated`. |
| 233-243 | `revokeRequest`: calls `request_revoke`, which refuses a second revoke (`request_revoked`), sets `revoked_at` on the link and `revoked` on the request, and logs `request.revoked`. |

## Tests

The routes that call this module are tested in `app/worker/test/admin-requests.test.ts` and `app/worker/test/admin-request-actions.test.ts` with this module mocked. The RPCs themselves are proven against the live database in `app/worker/test/requests-live.test.ts` (Plan 01).
