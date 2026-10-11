# app/worker/src/integrations/token-vault.test.ts

Unit tests for the token vault. No network, no database. Keys are fixed 64-hex strings (`a…a`, `b…b`).

| Test | Proves |
|------|--------|
| round-trips | `openToken` returns the sealed plaintext with the same key and connection id. |
| another connection id | The AAD binds the ciphertext to its row: a different connection id throws `decrypt_failed`. |
| a different key | `TOKEN_ENC_KEY_1` swapped throws `decrypt_failed`. |
| 12-byte iv, key_version 1 | The IV decodes to 12 bytes, `key_version` is 1, and the ciphertext does not contain the plaintext. |
| two seals differ | Random IVs: same plaintext, different `iv` and `ciphertext`. |
| bad key | A key that is not 64 hex characters throws `bad_key`. |
