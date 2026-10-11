# app/worker/src/routes/c-return.test.ts

Unit tests for `GET /c/return` through the full app, with `../db/bank` and `../db/connections` mocked and stub `JOBS` / `ASSETS` bindings.

| Test | Proves |
|------|--------|
| live nonce | 302 to `/c/return`, `JOBS.send` once with `{ type: 'reconcile', ref: 'C1' }`, `connection.returned` logged under the client actor. |
| unknown or used nonce | 302, no job, no event. |
| `?nonce=../etc` | 302 and `consumeReturnNonce` is never called (shape check). |
| no nonce | The SPA from `ASSETS.fetch`, 200. |
| status | `setConnectionStatus` is never called (T-04-18). |
