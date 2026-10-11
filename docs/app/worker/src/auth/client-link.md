# `app/worker/src/auth/client-link.ts`

Client-link tokens (D-17). The link a client receives by SMS or email is the credential, so this module owns how it is built and checked. No token is ever stored: staff can re-copy a link because the token is derived from the `client_links` row.

## Token format

`base64url(link_id ‖ HMAC-SHA256(CLIENT_LINK_HMAC_KEY, link_id ‖ uint32be(version)))`

- `link_id`: the 16 bytes of the `client_links.id` uuid (random, from `gen_random_uuid()`).
- MAC: 32 bytes. `version` is part of the MAC input, so bumping `version` (Phase 2 "regenerate") invalidates every older token for that row.
- 48 raw bytes, 64 base64url characters, no padding.

## Exports

| Export | What it does |
|--------|--------------|
| `ClientLinkRow` | The columns the Worker reads from `client_links`: `id`, `firm_id`, `request_id`, `version`, `expires_at`, `revoked_at`, `opened_at`. |
| `hmacKey(secret)` | Imports the secret's UTF-8 bytes as a non-extractable HMAC-SHA-256 key for `sign` and `verify`. The secret is the 64-hex-char `CLIENT_LINK_HMAC_KEY` from `provision-secrets.mjs`; its text bytes are the key material. |
| `cookieSecret(secret)` | `hex(SHA-256(secret + ':cookie'))`. Hono signs the `rs_client` cookie with this, so the cookie MAC key is never the link MAC key. |
| `uuidToBytes` / `bytesToUuid` | Convert between the uuid string and its 16 bytes. |
| `mintLinkToken(key, linkId, version)` | Signs `linkId ‖ be32(version)` and returns the 64-char token. |
| `verifyLinkToken(env, token, find?)` | Returns the row only when every check passes, otherwise `null`. |

## `verifyLinkToken` checks, in order

1. The token is exactly 64 base64url characters (`TOKEN_SHAPE`). Node's decoder skips invalid characters, so without this a token with junk appended would still decode.
2. The decoded payload is 48 bytes (`raw.length !== 48`). Both checks run before any database call.
3. `find(env, linkId)` returns a row. The default is `findClientLink` from `db/client-links.ts`; tests inject a fake.
4. `crypto.subtle.verify('HMAC', …)` accepts the MAC for the row's current `version`. This comparison is constant-time; the code never compares MAC bytes with `===`.
5. `revoked_at` is null and `expires_at` is in the future.

Any thrown error (bad input, database error) is caught and becomes `null`. The route then sends the same 404 for every failure, so a caller cannot tell malformed, unknown, revoked and expired tokens apart.

## Private helpers

- `concat(a, b)`: joins two byte arrays.
- `be32(n)`: the 4-byte big-endian encoding of `version`.

## Import cycle

`db/client-links.ts` imports `bytesToUuid` and the row type from here, and this module imports `findClientLink` from there. Both are used only inside function bodies, so the ES-module cycle is safe.

## Tests

`app/worker/src/auth/client-link.test.ts` (unit) and `app/worker/test/client-link.test.ts` (route).
