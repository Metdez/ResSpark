# `app/worker/src/auth/client-link.test.ts`

Unit tests for `auth/client-link.ts`, run in the `worker-node` Vitest project. No database: `verifyLinkToken` gets an injected `find` function.

| Test | Proves |
|------|--------|
| mints a 64-char base64url token | The D-17 length and alphabet. |
| verifies a freshly minted token | Mint and verify agree; the row is returned. |
| rejects a token minted for another version | `version` is bound into the MAC. |
| rejects one flipped MAC byte | Tampering fails. |
| rejects 47- and 49-byte payloads without a lookup | The length gate runs before `find`. |
| rejects an unknown link id | `find` returning `null` gives `null`. |
| rejects a revoked link / an expired link | Row state is checked after the MAC. |
| returns null when the lookup throws | Errors never escape, so the route stays uniform. |
| round-trips uuid and bytes | `uuidToBytes` / `bytesToUuid`. |
| derives a distinct cookie secret | `cookieSecret` is 64 hex chars, stable, and not the raw secret. |

The "verifies" test asserts on `?.id` rather than deep equality so the TAP reporter used for the RED evidence stays single-line.
