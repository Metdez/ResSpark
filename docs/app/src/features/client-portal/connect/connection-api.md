# `app/src/features/client-portal/connect/connection-api.ts`

Typed client for the Plan 04-03/04-04 `/api/c` connection routes. Every call goes through `portalFetch` (same-origin `rs_client` cookie, `X-Requested-With: ResSpark`, `PortalError { status, code }` on a non-2xx). Nothing here imports the staff `api()` wrapper or supabase-js.

## Types

- `MonthStatus`: `pending | available | not_supported | manual | missing`, one per statement month cell.
- `ClientConnectionView`: what `clientConnectionView()` in `worker/src/routes/c-connections.ts` returns: `id`, `status` (`pending | connected | syncing | done | error | removed`), `error_code`, `accounts[]` (each with `id`, `mask`, `name`, and `months[]` of `{ year, month, status }`), and `employers[]` (each with `company_name`, `status`, `pay_stubs`, `w2s`). It carries no provider ids, tokens, or document ids.
- `ItemConnection`: the `GET /api/c/items/:itemId/connection` body: `provider { id, configured, capabilities }`, `consented`, and `connection` (a view or `null`).

## Guards and helpers

- `isObject` (private): a non-null object.
- `isView` (private): an object with string `id` and `status` and array `accounts` and `employers`.
- `isItemConnection`: an object whose `provider` is an object with a boolean `configured`, a boolean `consented`, and a `connection` that is `null` or passes `isView`. A failing body makes `portalFetch` throw `PortalError(500, 'invalid_response')`.
- `isStart` (private): an object with a string `connection_id`. `bridge_token` (payroll) and `hosted_link_url` (bank) are optional, so the caller checks the one it needs.
- `isAny` (private): accepts any body, for routes whose body the client ignores (the `202` reconcile has none; `portalFetch` reads it as `undefined`).
- `post(body?)` (private): `{ method: 'POST' }`, plus a JSON `body` when one is given.

## Calls

| Function | Request | Result |
| --- | --- | --- |
| `getItemConnection(itemId)` | `GET /api/c/items/{itemId}/connection` | `ItemConnection` |
| `recordConsent(kind)` | `POST /api/c/consents` `{ kind, text_version: CONSENT_TEXT[kind].version }` | `void`; 409 `consent_text_stale` rejects |
| `startConnection(kind, itemId)` | `POST /api/c/connections/{kind}/start` `{ item_id }` | `{ connection_id, bridge_token?, hosted_link_url? }`; 409 `consent_required`, 503 `provider_not_configured`, 502 `provider_error` reject |
| `reconcileConnection(id)` | `POST /api/c/connections/{id}/reconcile` | `void`; never rejects |
| `attributeStatement(id, body)` | `POST /api/c/connections/{id}/statements/manual` `{ document_id, bank_account_id, year, month }` | `void`; 409 `month_available` rejects |

Path segments go through `encodeURIComponent`. `reconcileConnection` swallows every error because it is best effort: the provider webhook also reconciles, so a lost call only delays the status the client sees.

## Tests

See `connection-api.test.md`.
