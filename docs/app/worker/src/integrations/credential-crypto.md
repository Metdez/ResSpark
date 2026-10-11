# `app/worker/src/integrations/credential-crypto.ts`

Seals and unseals a firm's integration credentials (the Logics API key and secret token) with AES-GCM-256 inside the Worker (D-01, T-02-08). The `firm_integrations` table stores only ciphertext. The key never leaves Worker secrets.

| Lines | What it does |
|-------|--------------|
| 1-3 | Key facts: `INTEGRATION_ENC_KEY` is a 32-byte secret written as 64 hex characters, provisioned by `app/scripts/provision-secrets.mjs` (Plan 03). Rotating it means re-encrypting every `firm_integrations` row. |
| 5-11 | `importAesKey`: rejects with `Error('bad_key')` unless the key is exactly 64 hex characters, then imports the raw bytes as a non-extractable AES-GCM key usable for encrypt and decrypt. |
| 13-19 | `encryptSecret`: a fresh 12-byte random IV per call (`crypto.getRandomValues`), AES-GCM encrypt of the UTF-8 plaintext (Web Crypto appends the 16-byte tag), and returns `base64url(iv ‖ ciphertext ‖ tag)`. A 6-character secret becomes 34 bytes before encoding. |
| 21-32 | `decryptSecret`: decodes base64url, requires at least IV + tag (28 bytes), splits off the IV, and decrypts. Any failure (wrong key, a flipped byte that breaks the tag, truncated or garbage input) becomes `Error('decrypt_failed')`, so no plaintext or detail reaches a message. A malformed key still rejects `bad_key` first, which tells a config error apart from bad data. |
| 34-37 | `keyHint`: the last four characters of the API key, or `••••` when the key is shorter than four. It is the only credential-derived value the admin UI may show. |

## Notes

- Uses Web Crypto (`crypto.subtle`, available in Workers and Node ≥ 22) and `Buffer` (available under the `nodejs_compat` flag) for hex and base64url.
- `Buffer` values are copied into plain `Uint8Array`s before they reach Web Crypto, which keeps the `BufferSource` types strict.

## Tests

`credential-crypto.test.ts` (co-located, `worker-node` project): token length 12 + 6 + 16, a different token for each encryption, round trip, wrong key, flipped byte, truncated and empty input, `bad_key` for short and non-hex keys, no plaintext in any error message, and both `keyHint` cases.
