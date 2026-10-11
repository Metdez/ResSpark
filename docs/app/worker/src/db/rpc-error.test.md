# `app/worker/src/db/rpc-error.test.ts`

Unit tests for `rpcErrorToken` (worker-node project).

| Test | Proves |
|------|--------|
| SQLSTATE prefix | `P0001: no_items` → `no_items`. |
| bare token | `request_not_draft` → itself. |
| unrelated message | a unique-violation message → `null`. |
| no error | `null` → `null`. |
| whole words only | `no_items_left` → `null`. |
