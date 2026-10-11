# app/worker/src/jobs/bank-reconcile.ts

`reconcileBank(env, conn, opts)`: the bank branch of `reconcileConnection` (D-04, D-09, BANK-02). It runs from the webhook consumer, the cron, the client return, and staff Refresh.

## With a sealed secret

The connection already has an access token. `openToken` decrypts it (proving the vault end to end) and the function returns the current status unchanged. Plan 04-04 Task 2 adds the transactions sync and statements here.

## Without a secret (completion)

| Hint | Result |
|------|--------|
| `LINK` / `EVENTS` (or any LINK code other than `SESSION_FINISHED`) | Stored by the webhook route, ignored here. Nothing changes. |
| `LINK` / `SESSION_FINISHED` with `status` other than `SUCCESS` | Logs `connection.session_exited` with the status. The connection stays `pending`. |
| `LINK` / `SESSION_FINISHED` `SUCCESS` | The webhook's `public_tokens` are exchanged. |
| no LINK hint (cron, client return, staff) | With a `link_ref`, `completeSession` recovers the public tokens from `/link/token/get`. Without one, nothing happens. |

No results means still `pending`. For the first result:

1. `sealToken` with AAD = connection id, then `saveSecret` (upsert on `connection_id`, so a rerun never duplicates).
2. `updateConnection`: `external_id` = Plaid `item_id`, `data.institution_name`, `remove_after` = now + `PLAID_REMOVE_AFTER_DAYS` days (default 30, D-13).
3. `setConnectionStatus(..., 'connected')`, which also moves the request item to `submitted` (migration 0005's `connection_set_status`).

Each extra result (one Link session adding several banks) becomes a sibling connection on the same request item with `data.parent_connection_id`, its own sealed secret, its own `remove_after`, status `connected`, and one queued `reconcile` job.

Only this path can mark a bank connection connected: the `/c/return` route and `LINK/EVENTS` never do (plan prohibition). The access token never reaches rows, events, logs or queue messages.
