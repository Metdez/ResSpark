# `app/worker/src/db/rpc-error.ts`

Maps a Supabase RPC error to one of migration 0003's bare RAISE tokens.

| Lines | What it does |
|-------|--------------|
| 1-10 | `RPC_TOKENS`: `no_items`, `case_not_found`, `request_not_found`, `request_not_draft`, `request_not_active`, `request_revoked`, `link_inactive`. |
| 12 | `RpcToken`: the union of those strings. |
| 14-18 | `rpcErrorToken`: splits `error.message` on non-word characters and returns the first token present as a whole word, or `null`. supabase-js may put the SQLSTATE in front of the RAISE text (`P0001: no_items`); whole-word matching stops `no_items_left` from matching `no_items`. |

## Tests

`app/worker/src/db/rpc-error.test.ts`.
