# `app/worker/src/db/client-links.ts`

Data access for `public.client_links` with the per-request service-role client (`createAdminClient`).

| Export | What it does |
|--------|--------------|
| `findClientLink(env, linkId)` | Converts the 16 token bytes to the uuid and reads `id, firm_id, request_id, version, expires_at, revoked_at, opened_at` with `maybeSingle()`. Returns `null` when no row exists. A Supabase error throws `client_link_lookup_failed` (a fixed string, so no query detail reaches a log); `verifyLinkToken` turns that into `null`. |
| `createClientLink(env, input)` | Inserts a link for `firm_id` and `request_id`, with optional `created_by` and `expires_in_days` (default 14), and returns the new row. Errors throw `client_link_insert_failed`. |

## Notes

- `request_id` is required. Migration 0003 made `client_links.request_id` `NOT NULL` with a foreign key to `requests` and a unique index, so a link always belongs to one request. Phase 2's send and regenerate flows create links through the `request_send` / `request_regenerate_link` RPCs; `createClientLink` is the direct-insert helper for code that already holds a request.
- The lookup is by primary key only. The token does not carry `firm_id`; callers that act on the row scope later queries by the row's `firm_id`.
- Nothing here writes `opened_at`. Phase 2's `request_open` RPC owns that.
