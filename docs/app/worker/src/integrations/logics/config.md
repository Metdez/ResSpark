# `app/worker/src/integrations/logics/config.ts`

Picks which Logics client a request uses (fixtures or live) and guards the admin-editable base URL (D-01, D-03, LOOK-05, T-02-07, T-02-09). Routes in Plans 03-05 call `resolveLogicsClient` and never build a client themselves.

| Lines | What it does |
|-------|--------------|
| 1-3 | Imports decryption, the live client and its error type, and the fixture client. |
| 5 | `DEFAULT_LOGICS_BASE_URL`: the ValorTax V4 public API root, with a trailing slash so relative endpoint paths resolve under it. |
| 7 | `LogicsEnv`: `Pick<Env, 'LOGICS_MODE' \| 'INTEGRATION_ENC_KEY' \| 'APP_ENV'>`, the three env values this module reads. Plan 03 declared them in `wrangler.jsonc` and regenerated `worker-configuration.d.ts`, replacing the earlier local interface. |
| 9-14 | `IntegrationRow`: the `firm_integrations` columns used here. `null` ciphertext means "not entered"; `last_test_ok` `null` means "never tested". |
| 16 | `LogicsMode`: `fake` or `live`, returned so the UI can show which one answered. |
| 18-34 | `validateLogicsBaseUrl`: parses with `new URL` (failure → `invalid_base_url`). Requires `https:`. Rejects IP-literal hosts (anything containing `:` or `[`, or made only of digits and dots; WHATWG parsing already turns `0x7f.1` and `2130706433` into dotted form) and rejects URLs with a query or fragment. In `production` the host must be `logiqsapi.com` or end with `.logiqsapi.com`, so `logiqsapi.com.evil.example` fails. Returns the normalized `href` with exactly one trailing `/`. |
| 36-54 | `liveClientFromRow`: both ciphertexts are required (`not_configured` otherwise). It re-validates the stored base URL against the current `APP_ENV`, decrypts both values (a rotated key or corrupted row becomes `not_configured`), and builds the live client. "Test connection" calls it directly, before `last_test_ok` exists. |
| 56-67 | `resolveLogicsClient`: `LOGICS_MODE === 'fake'` always returns the fixture client, even when tested credentials exist, so a demo can never read the real tenant (C1). Otherwise it needs a row with both ciphertexts and `last_test_ok === true`, else `not_configured`, and returns the live client with `mode: 'live'`. |

## Precedence

| `LOGICS_MODE` | Row state | Result |
|---------------|-----------|--------|
| `fake` | anything, including none | fixture client, `mode: 'fake'` |
| `live` (or unset) | no row | `LogicsError('not_configured')` |
| `live` | a ciphertext missing | `not_configured` |
| `live` | `last_test_ok` null or false | `not_configured` |
| `live` | ciphertexts present, tested, decryptable | live client, `mode: 'live'` |

Switching to `live` is a deliberate config change the firm makes after Test connection succeeds (USER ACTION, Plan 03).

## Errors

- `Error('invalid_base_url')`: the URL fails the guard, either on save (Plan 03 PUT) or on re-validation before a live client is built.
- `LogicsError('not_configured')`: there are no usable live credentials.

## Tests

`config.test.ts` (co-located, `worker-node` project): trailing slash added, http rejected in both envs, host pinned in production only (including the `logiqsapi.com.evil.example` suffix trick), IPv4 and IPv6 literals rejected, non-URL rejected; fake mode with and without a row; live mode with no row, untested or failed credentials, and a missing ciphertext; a live client built from encrypted `K`/`S` that sends `Basic base64(K:S)` to `base_url + Find/FindCaseByEmail`; `liveClientFromRow` for untested credentials, re-validation in production, a rotated key, and a missing ciphertext.
