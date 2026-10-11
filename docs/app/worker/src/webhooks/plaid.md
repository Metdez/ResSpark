# `app/worker/src/webhooks/plaid.ts`

Plaid webhook verifier (D-02), following plaid.com/docs/api/webhooks/webhook-verification.

## Parts

| Part | What it does |
|------|--------------|
| `keys` | Module-level `kid` → JWK cache. Workers isolates may recycle it; that only costs one more key fetch. |
| `enc`, `hex` | UTF-8 encode; hex-encode a digest. |
| `_setPlaidKeyForTests`, `_clearPlaidKeysForTests` | Test seams for the cache, so unit and live tests verify without a key fetch. |
| `plaidKeyFetch(env, kid)` | `plaidFetch(env, '/webhook_verification_key/get', { key_id })` through the shared Plaid client (`integrations/bank/plaid/client.ts`, which picks the host by `PLAID_ENV` and sends `PLAID-CLIENT-ID` / `PLAID-SECRET`). Any thrown `ProviderError` (non-2xx, network, bad JSON) or a key whose `expired_at` is set returns `null` (unverifiable). |
| `configured(env)` | Both `PLAID_CLIENT_ID` and `PLAID_SECRET` are non-empty. |
| `verify(raw, headers, env)` | 1. Reads the `plaid-verification` header (missing → `null`). 2. `decodeProtectedHeader`: any `alg` other than `ES256`, or no `kid`, is rejected before any key fetch. 3. Cache hit or one key fetch (cached on success). 4. `importJWK(key, 'ES256')` and `jwtVerify` with `algorithms: ['ES256']` and `maxTokenAge: '5 min'`, so an `iat` older than five minutes fails. 5. SHA-256 of the exact raw string, hex, compared with the `request_body_sha256` claim: length check, then `timingSafeEqual` (`node:crypto`). Plaid notes the hash is whitespace-sensitive. 6. Only then parses the body; a non-object is `null`. Returns `{ payload, iat }`. |
| `eventKey(v)` | `LINK` webhooks (`SESSION_FINISHED`, `EVENTS`): `${link_session_id}:${webhook_code}`. Item webhooks (`TRANSACTIONS`, `ITEM`, `STATEMENTS`): `${item_id}:${webhook_code}:${iat}`. |

## Assumption

`[ASSUMED]` Plaid item webhook bodies carry no event id or timestamp, so the JWT `iat` stands in for D-02's "timestamp". Two genuinely separate item webhooks with the same code in the same second would collapse into one ledger row; the cron reconciler (Plan 02) is the backstop.

## Tests

`plaid.test.ts` (unit, no network): verified `SESSION_FINISHED` (`SUCCESS` and `EXITED`) with key `ls_…:SESSION_FINISHED`; one byte appended → `null`; `HS256` header → `null` with no key fetch; `iat` 6 minutes old → `null`, 4 minutes old → verified; unknown `kid` fetched once (body `{ key_id }`, Plaid headers) then cached; failed key fetch → `null`; `SYNC_UPDATES_AVAILABLE` key includes `iat`; `EVENTS` key; missing header → `null`; `configured` false without either secret.
