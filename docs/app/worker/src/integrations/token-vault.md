# app/worker/src/integrations/token-vault.ts

Seals and opens Plaid access tokens (D-09, BANK-02). The ciphertext lives only in `connection_secrets`; the plaintext exists only in memory during a provider call.

| Part | What it does |
|------|--------------|
| `SealedToken` | `{ ciphertext, iv, key_version }`. `ciphertext` and `iv` are base64url strings and match the split columns of `connection_secrets`. `ciphertext` includes the 16-byte GCM tag. |
| `CURRENT_KEY_VERSION` | `1`. New seals use `TOKEN_ENC_KEY_1`. |
| `vaultKey(env, version)` | Reads `TOKEN_ENC_KEY_<version>` from the Worker env. It must be 64 hex characters (32 bytes), otherwise `Error('bad_key')`. Imports it as a non-extractable AES-GCM key. |
| `aad(connectionId)` | The connection id as UTF-8 bytes. It is the GCM additional authenticated data, so a ciphertext copied onto another connection row will not open. |
| `sealToken(env, connectionId, plaintext)` | A fresh random 12-byte IV per call, AES-GCM-256 encrypt with the AAD, returns `{ ciphertext, iv, key_version: 1 }`. Two seals of the same token differ. |
| `openToken(env, connectionId, sealed)` | Picks the key by `sealed.key_version`, decrypts with the same AAD. Any failure (wrong key, wrong connection id, tampered bytes) throws `Error('decrypt_failed')` with no detail. |

## Rotation

Rotation is a one-line change: add `TOKEN_ENC_KEY_2`, bump `CURRENT_KEY_VERSION`, and old rows still open under their stored `key_version`. Changing the format itself (AAD, column split) would mean re-encrypting every row (the plan's reversibility note).

## Style

Same house style as `credential-crypto.ts` (hex key, `crypto.subtle`, `Buffer` base64url), differing only by the AAD and the separate `iv` column.
