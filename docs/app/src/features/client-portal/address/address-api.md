# `app/src/features/client-portal/address/address-api.ts`

Typed client for the Worker's address routes (`app/worker/src/routes/c-address.ts`, Plan 06-01). Contracts are mirrored, not imported, and every response passes a type guard; nothing is cast.

- `AddressSuggestion`: Smarty US Autocomplete Pro's row: `street_line, secondary, city, state, zipcode, entries`.
- `ConfirmBody`: either `{ source: 'smarty', street_line, secondary?, city, state, zipcode }` (a picked suggestion; the Worker re-verifies it) or `{ source: 'manual', street, unit?, city, state, zip5 }`.
- `ConfirmResult`: the standardized address (no county, FIPS, or RDI; those are staff-only), `verified`, `dpv`, `needs_unit` (DPV `D` or `S`), `item_status`, `request_status`.
- `isSuggestResponse`, `isConfirmResult`: the guards. A failing guard surfaces as `PortalError(500, 'invalid_response')` from `portalFetch`.
- `selectedFor(s)`: Smarty's documented `selected` format, `${street_line} ${secondary} (${entries}) ${city} ${state} ${zipcode}`, used to expand a multi-unit row.
- `suggestAddresses(q, selected?)`: `GET /api/c/address/suggest?q=…[&selected=…]`, both URL-encoded; returns the suggestion array.
- `confirmAddress(itemId, body)`: `POST /api/c/items/:itemId/address` with the JSON body.

Both go through `portalFetch`, which sends the cookie, `content-type: application/json`, and `X-Requested-With: ResSpark`, and throws `PortalError(status, code)` on a non-2xx answer.

Tests (`address-api.test.ts`): the encoded query and header, the `selected` parameter, the invalid-response error, `selectedFor`, the POST body and result, and a malformed result.
