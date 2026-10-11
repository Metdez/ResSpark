# `app/worker/src/routes/c-connections.ts`

Client connection routes under `/api/c` (Plan 04-03). Identity comes only from the `rs_client` cookie (`clientSession`); bodies and path ids are untrusted. Every response gets `Cache-Control: no-store` from the `/api/c/*` privacy middleware in `index.ts`.

## Helpers

- `session_`: runs `clientSession` unless an earlier `/api/c` route already resolved the cookie (same pattern as `c-uploads.ts`; a `use('*')` here would also match the sibling routes).
- `itemOf(c, id)`: `findSessionItem` filtered by the session's `request_id` in SQL, so another request's item is a uniform 404 (T-04-12). Non-uuid ids are 404 without a query.
- `providerFor(env, kind)`: `payroll_connect` → `truv`; `bank_connect` → `env.BANK_PROVIDER`.
- `ipClass(ip)`: `ipv6` when the `cf-connecting-ip` contains `:`, `ipv4` for digits and dots, else `unknown`. Only the class is stored.
- `clientConnectionView(summary)`: builds the client projection from an explicit field list: `id, status, error_code, accounts[{ id, mask, name, months[{ year, month, status }] }], employers[{ company_name, status, pay_stubs, w2s }]`. No document ids, timestamps, external ids or tokens cross (T-04-15).

## Routes

### `GET /items/:itemId/connection`

| Check | Result |
|-------|--------|
| item not on the session's request | 404 `not_found` |
| item kind not `bank_connect`/`payroll_connect` | 409 `item_not_connect` |
| otherwise | 200 `{ provider: { id, configured, capabilities }, consented, connection }` |

`capabilities` is `PROVIDER_CAPABILITIES[id]` (null for Truv). `consented` checks the current `CONSENT_TEXT` version. `connection` is the latest connection on the item through `latestItemSummary`, projected by `clientConnectionView`, or null.

### `POST /consents` (needs `X-Requested-With: ResSpark`)

Guard order: header (403 `bad_origin`) → body is an object with `kind` in `bank_data|payroll_data` and a string `text_version` of at most 32 chars (400 `bad_request`) → version equals the current one (409 `consent_text_stale`) → `recordConsent`. When a row was created, logs `consent.<kind>` (actor `client`, `link:<link id>`, payload `{ kind, text_version }`). Answers 200 `{ consented: true }` either way, so a repeat is harmless. An optional `user_agent_class` (`phone|tablet|desktop`) is stored; anything else stores null.

### `POST /connections/:kind/start` (header required)

| Order | Check | Result |
|-------|-------|--------|
| 1 | `kind` not `bank`/`payroll` | 404 |
| 2 | body `item_id` missing or not a uuid | 400 `bad_request` |
| 3 | item not on the session's request | 404 `not_found` |
| 4 | item kind is not `<kind>_connect` | 409 `item_kind_mismatch` |
| 5 | item `approved` | 409 `item_approved` |
| 6 | no consent for the current version | 409 `consent_required` |
| 7 | provider secrets missing | 503 `provider_not_configured` ("Provider not configured") |
| 8 | request or case missing | 404 |
| 9 | `kind === 'bank'` | `startBank(env, { client, item, caseRow, origin })` (Plan 04-04, `integrations/bank/start.ts`; `origin` is `new URL(c.req.url).origin`) → 200 `{ connection_id, kind: 'bank', provider, capabilities, hosted_link_url }` |
| 10 | `startPayroll` or `startBank` throws `ProviderError` | 502 `provider_error`, message = vendor code |
| - | success | 200 `{ connection_id, kind: 'payroll', provider: 'truv', capabilities: null, bridge_token }` |

The consent gate runs before any vendor call in the same request (T-04-13). The case row comes from `sessionRequest` (the Phase 3 helper that reads `requests.case_id` for the session) and `getCase`.

### `POST /connections/:id/reconcile` (header required)

`allowInWindow('rc:<link id>', 10, 60 s)` first (429 `rate_limited` on the 11th call in a minute, T-04-17). Then `getConnection`; a non-uuid id, a missing row, or a row whose `request_id` is not the session's is 404. Otherwise `env.JOBS.send({ type: 'reconcile', ref })` and 202 `{ queued: true }`. The route never changes status: the job reads the provider (D-04, D-05).

### `POST /connections/:id/statements/manual` (header required, Plan 04-04)

Body `{ document_id, bank_account_id, year, month }`. Attributes a document the client uploaded on the same item to one account-month cell (D-10, BANK-03).

| Order | Check | Result |
|-------|-------|--------|
| 1 | body not an object; ids not uuids; `year` not an integer; `month` not 1..12 | 400 `bad_request` |
| 2 | connection missing, on another request, or not `bank` | 404 |
| 3 | `findSessionDocument` (request-scoped) misses, or the document is on another item | 404 |
| 4 | document not `ready` | 409 `document_not_ready` |
| 5 | `findConnectionAccount`: the account is not on this connection | 404 |
| 6 | the month is not in `targetMonths(now, 6)` (`isInWindow`) | 400 `bad_request` |
| 7 | the cell is `available` (the bank supplied it) | 409 `month_available` |
| 8 | otherwise | `setMonthCell(..., 'manual', document_id)` (upsert, so it creates a missing cell and a second attribution replaces the document), logs `statement.manual_attributed` with `{ bank_account_id, year, month, document_id }` under `link:<linkId>`, 200 `{ status: 'manual' }` |

All not-found cases answer the same 404 so a client cannot probe other ids (T-04-22).

## Tests

- `app/worker/test/payroll-start.test.ts` (live): the full cookie → consent → start → reuse → view → reconcile → CSP path.
- `app/worker/src/routes/c-connections.test.ts` (unit): every guard and status code above.
