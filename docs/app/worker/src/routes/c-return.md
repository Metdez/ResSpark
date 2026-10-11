# app/worker/src/routes/c-return.ts

`cReturnRoute`: `GET /c/return`, where Plaid Hosted Link sends the client's browser after the session (D-08, T-04-18).

| Request | Response |
|---------|----------|
| no `nonce` query param | The SPA (`c.env.ASSETS.fetch(c.req.raw)`); the client page polls the connection. |
| `nonce` that matches `^[A-Za-z0-9_-]{16,32}$` and is unused | `consumeReturnNonce` marks it used, one `{ type: 'reconcile', ref }` job is sent, `connection.returned` is logged under the client actor, then 302 to `/c/return`. |
| `nonce` unknown, already used, or badly shaped | 302 to `/c/return`, no job, no event. A badly shaped nonce never reaches the database. |

The redirect strips the nonce from the address bar. Plaid redirects here on success and on exit alike, so the route never reads or writes `connections.status`; only the reconcile job, after re-reading Plaid, can connect the bank.

Mounted in `index.ts` at `/c` before `clientLinkRoute`, because Hono matches in registration order and `/c/:token` would otherwise treat `return` as a link token. The `/c/*` privacy headers and CSP still apply.
