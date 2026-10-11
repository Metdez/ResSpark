# app/worker/src/routes/c-return.test.ts

Unit tests for `GET /c/return` through the full app, with `../db/bank` and `../db/connections` mocked and stub `JOBS` / `ASSETS` bindings.

| Test | Proves |
|------|--------|
| live nonce | 302 to `/c/return`, `JOBS.send` once with `{ type: 'reconcile', ref: 'C1' }`, `connection.returned` logged under the client actor. |
| unknown or used nonce | 302, no job, no event. |
| `?nonce=../etc` | 302 and `consumeReturnNonce` is never called (shape check). |
| no nonce | The SPA from `ASSETS.fetch`, 200. |
| immutable asset headers | The asset `Response` has `headers.set/append/delete` that throw, like a real ASSETS response. A request to a non-local host (`clientCsp` skips localhost) still gets 200 and a CSP naming `cdn.truv.com`. This is the Plan 04-07 regression test for the deployed 500. |
| status | `setConnectionStatus` is never called (T-04-18). |
