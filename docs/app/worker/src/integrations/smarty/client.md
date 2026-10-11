# `app/worker/src/integrations/smarty/client.ts`

Plain-`fetch` Smarty client (D-03: no SDK). Server-to-server only: the browser never calls Smarty and never sees a key.

## Constants and auth
- `AUTOCOMPLETE` is `https://us-autocomplete-pro.api.smarty.com/lookup`; `STREET` is `https://us-street.api.smarty.com/street-address`.
- `smartyConfigured(env)`: true only when both `SMARTY_AUTH_ID` and `SMARTY_AUTH_TOKEN` are non-empty. Both are optional Worker secrets, typed in `worker/src/provider-env.d.ts`.
- `smartyGet(env, url, params)` (private): sends `Authorization: Basic base64(id:token)`, never the `auth-id`/`auth-token` query form, so the token never appears in a URL. Failure mapping:
  - unconfigured → `ProviderError('smarty', null, 'provider_not_configured', false)`
  - a thrown `fetch` → `network` (transient)
  - non-2xx → `http_<status>`, transient per `isTransientStatus`
  - unparseable JSON → `bad_response`

  Nothing about the request or the response is logged.
- `isObject`, `str` (private): `str` returns the value only when it is a non-blank string, else `null`.

## `suggest(env, search, selected?)`
US Autocomplete Pro. Sends:
- `search` cut to 32 characters (Smarty's limit),
- `max_results=5`,
- `prefer_geolocation=none` (the default ranks by the caller's IP, which here is the Cloudflare edge),
- `selected` when given (expands the units of a building).

Smarty omits `suggestions` when nothing matches, so that returns `[]`. Each entry is rebuilt from the six fields `street_line, secondary, city, state, zipcode, entries`. Anything else Smarty adds is dropped, and malformed entries are skipped.

## `verifyStreet(env, input)`
US Street with component fields (`street`, `secondary` when non-null, `city`, `state`, `zipcode`), `candidates=1`, and `match=invalid`. Freeform input would silently fall back to strict matching, so it is never used. `[]` → `null`, which the route turns into the D-06 manual fallback. A candidate that cannot be mapped → `bad_response`.

## `mapStreetCandidate(candidate)`
Smarty returns only non-blank fields, so every absent or blank value becomes `null`.

| Field | Source |
|---|---|
| `line1` | `delivery_line_1` (required; without it the whole candidate is `null`) |
| `line2` | `delivery_line_2` |
| `city` | `components.city_name` |
| `state_code` | `components.state_abbreviation` |
| `zip5` / `zip4` | `components.zipcode` / `components.plus4_code` |
| `county_name` / `county_fips` | `metadata.county_name` / `metadata.county_fips` |
| `rdi` | `metadata.rdi`, only when `Residential` or `Commercial` |
| `dpv` | `analysis.dpv_match_code`, only when one of `Y N S D` |

## Types
`AddressSuggestion`, `StreetInput`, and `VerifiedAddress` are the contracts that `routes/c-address.ts` and `db/case-address.ts` use.
