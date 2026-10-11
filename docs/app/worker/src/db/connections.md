# `app/worker/src/db/connections.ts`

Data access for the `connections` and `connection_secrets` tables (migration 0005). Every query uses a fresh `createAdminClient(env)`, like the other `db/` modules. Postgres error text never leaves this module: failures throw fixed tokens.

## Types

- `ProviderId` (`plaid | truv | teller | docuseal`), `ConnectionKind` (`bank | payroll | signature`; Phase 6 e-sign rows are `docuseal`/`signature`), `ConnectionStatus` (`pending | connected | syncing | done | error | removed`) mirror the CHECK constraints.
- `ConnectionRow` is the selected column set (`COLUMNS`); `return_nonce_used_at` and `updated_at` are not selected because no caller needs them yet.
- `SetStatusResult` is the JSON returned by `connection_set_status`.
- `SealedSecret` is the `connection_secrets` payload (`ciphertext`, `iv`, `key_version`).

## Helpers

- `TOKENS` / `tokenOf`: the RPCs raise bare tokens (`connection_not_found`, `bad_status`); `tokenOf` finds one in the error message (supabase-js may prefix a SQLSTATE) or falls back to a fixed string.
- `findOne(env, column, value, provider?)`: newest matching row or `null`.

## Functions

| Function | What it does |
|----------|--------------|
| `insertConnection(env, input)` | Inserts a row (status defaults to `pending`) and returns it. Callers insert the row before handing the client a vendor URL (Pattern 2: row before URL). Throws `connection_insert_failed`. |
| `getConnection(env, id)` | Row by id or `null`. |
| `findConnectionByExternalId(env, provider, externalId)` | Row by Truv order id / Plaid item id (unique per provider). |
| `findConnectionByLinkRef(env, linkRef)` | Row by Plaid link token. |
| `findConnectionByEmployerLink(env, linkId)` | Truv row whose `data.employers[]` contains `{ link_id }` (jsonb containment). Used for Truv task webhooks, which carry a `link_id` but no order id. |
| `latestConnectionForItem(env, requestItemId)` | Newest row for an item, ties broken by id. |
| `listNonTerminalConnections(env, kind, limit)` | `pending`, `connected`, `syncing` rows of a kind, least recently polled first. Used by the unmatched-payroll path and the cron. |
| `updateConnection(env, id, patch)` | Updates non-status columns only. It cannot set `status`: `connection_set_status` is the only status writer (D-03). |
| `setConnectionStatus(env, id, status, detail?, actorId?)` | Calls `rpc('connection_set_status', …)`; errors become `connection_not_found`, `bad_status` or `status_failed`. |
| `recordConnectionEvent(env, id, action, payload?, actor?)` | Calls `rpc('connection_record_event', …)`; default actor is `provider`. |
| `saveSecret`, `getSecret`, `deleteSecret` | Upsert, read and delete the sealed access token (Plan 04 encrypts/decrypts). |
