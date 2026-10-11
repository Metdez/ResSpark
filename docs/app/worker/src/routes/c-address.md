# `app/worker/src/routes/c-address.ts`

The client address step's two routes, mounted at `/api/c` in `index.ts` (ADDR-01, D-03 to D-06). Identity is the `rs_client` cookie only.

## Shared pieces
- `session_`: runs `clientSession` unless an earlier `/api/c` router already resolved the cookie. It is per route, not `use('*')`, for the same reason as in `c-uploads.ts`: a `'*'` here would also match the portal's paths.
- `fail(c, status, code, message)`: the `{ error: { code, message } }` envelope with fixed strings; sets `errorCode` for the logger.
- `allowed(c)`: `allowInWindow('addr:' + linkId, 30, 60_000)`. Suggest and confirm share one window per link, so the 31st call in a minute gets 429 `rate_limited` (T-06-02). This 429 is ours and must not trigger the SPA's manual fallback.
- `text`, `optional`, `isObject`: small body guards. Lengths are checked on trimmed text.

## `GET /address/suggest?q=…&selected=…`
`q` is trimmed and must be 3 to 100 characters; `selected` is at most 200. Then the rate window, then `smartyConfigured` (503 `provider_not_configured`), then `suggest()`. Any `ProviderError` → 502 `provider_error`. Returns `{ suggestions }` with the six suggestion fields only.

## `POST /items/:itemId/address`
Needs `X-Requested-With: ResSpark` (`requireClientHeader`, else 403 `bad_origin`). Order: rate window → `findSessionItem` scoped to the session's request (404) → `kind === 'address'` (409 `item_kind_mismatch`) → body guard (400) → source branch.

- `source: 'smarty'`, body `{ street_line 1–100, secondary? ≤ 32, city 1–64, state ^[A-Z]{2}$, zipcode ^\d{5}$ }`. Unconfigured → 503. `verifyStreet` returning `null` → 422 `address_unverifiable` and nothing is written (D-06; the SPA switches to the manual form). `ProviderError` → 502. The payload is the mapped USPS address with `verified = dpv === 'Y'`.
- `source: 'manual'`, body `{ street 1–100, unit? ≤ 32, city 1–64, state (isUsStateCode), zip5 ^\d{5}$ }`. Works with no Smarty keys. The payload holds the typed values, `line2 = unit || null`, and `null` for `zip4`, county, FIPS, RDI, and DPV, with `verified: false`.

Then `confirmAddress`. Token mapping: `link_inactive` → 401 `no_session`, `item_not_found` → 404, `item_approved` → 409 `item_approved`, `bad_address` → 400.

Response 200: `{ address: { line1, line2, city, state_code, zip5, zip4 }, verified, dpv, needs_unit, item_status, request_status }`. `needs_unit` is true for DPV `D` (unit missing) or `S` (unit not recognized). County, FIPS, and RDI are staff-only facts and are never returned.

## Error codes

| Status | Code | When |
|---|---|---|
| 400 | `bad_request` | bad query or body, or RPC `bad_address` |
| 401 | `no_session` | no cookie, or RPC `link_inactive` |
| 403 | `bad_origin` | POST without `X-Requested-With: ResSpark` |
| 404 | `not_found` | item not in this request, or RPC `item_not_found` |
| 409 | `item_kind_mismatch` | item is not an address item |
| 409 | `item_approved` | staff already approved the address |
| 422 | `address_unverifiable` | US Street returned `[]` |
| 429 | `rate_limited` | over 30 address calls a minute on this link |
| 502 | `provider_error` | any Smarty failure. The threshold is one failure: the SPA falls back to manual entry on the first |
| 503 | `provider_not_configured` | Smarty keys absent (suggest and `smarty` POST only) |

No street text, request URL, or header is logged; the logger records only the route and `errorCode`.
