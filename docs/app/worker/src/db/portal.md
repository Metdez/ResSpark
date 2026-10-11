# `app/worker/src/db/portal.ts`

Database access for the client portal (Plan 02-07). It uses the service-role client from `db/client.ts`, so every query is scoped by the ids in `ClientCtx`. Those ids come from the verified cookie link (`middleware/client-session.ts`), never from the request.

## Types

| Name | Meaning |
|------|---------|
| `PortalStep` | One step the client sees: `id`, `position`, `kind` (`ItemKind` from `db/requests.ts`: `bank_connect`, `payroll_connect`, `address`, `upload`, `signature`, `intake`), `label`, `required`, and `status` (`pending`, `in_progress`, `submitted`, `approved`, `rejected`). |
| `PortalState` | The `GET /api/c/state` body: `firm_name`, `agent_display_name`, `status` (the request status), `opened_at`, `expires_at`, `steps`. Plan 08's SPA mirrors this shape. |
| `PortalRow` (private) | The shape of the embedded select below, used for a single cast. |

## `getPortalState(env, client)`

1. One query: `requests` with `status, agent_display_name, firms!inner(name), request_items(id, position, kind, label, required, status)`, filtered by `.eq('id', client.requestId)` **and** `.eq('firm_id', client.firmId)`, then `maybeSingle()`.
2. A query error throws `portal_lookup_failed` (a 500). No row returns `null`, and the route turns that into the same 401 as a missing session.
3. It builds the DTO from an explicit field list. Rows are never spread, so `contact_email`, `contact_phone_e164`, `case_id`, `config`, `rejection_note`, and every id except the step ids stay out (C2, C3, T-02-37). `opened_at` and `expires_at` come from the link in `client`. Steps are sorted by `position` ascending.

## `openRequest(env, linkId)`

It calls `rpc('request_open', { p_link_id })` (migration 0003). The RPC is idempotent: the first call sets `client_links.opened_at`, sets `requests.status = 'opened'`, and logs `request.opened`. Later or concurrent calls return the stored `opened_at` and write nothing. An RPC error throws its token through `rpcErrorToken` (`link_inactive` for a revoked or expired link), or `open_failed`.

## `upsertClientSession(env, input)`

It upserts one `client_sessions` row per link (`onConflict: 'link_id'`) with `last_step`, `last_error`, `user_agent_class`, and `seen_at = now` (ISO string from the Worker). An error throws `session_write_failed`. Phase 3's mirror view reads this table. The route validates lengths and the enum before calling (see `routes/client-portal.md`).

## Tests

`app/worker/test/client-portal.test.ts` (`db/portal` block) runs the real module against a mocked `createAdminClient`. It checks the two `eq` filters, the sorting, the allow-list (an extra `contact_email` and `config` are dropped), the `request_open` arguments, and the `link_inactive` mapping.
