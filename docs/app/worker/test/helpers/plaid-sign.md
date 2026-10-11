# `app/worker/test/helpers/plaid-sign.ts`

`makePlaidSigner()`: a stand-in for Plaid's webhook signer.

- Generates an extractable ES256 key pair with jose and a random `kid`.
- `jwk`: the public key as Plaid's `/webhook_verification_key/get` would return it (`kid`, `alg: ES256`, `use: sig`). Tests either inject it with `_setPlaidKeyForTests(kid, jwk)` or serve it from a stubbed key fetch.
- `sign(raw, { iat?, alg? })`: a `Plaid-Verification` JWT with protected header `{ alg, kid, typ: 'JWT' }` and claims `{ iat, request_body_sha256: hex(sha256(raw)) }`. `iat` defaults to now. `alg` exists only for the negative case: anything other than `ES256` is signed with a throwaway symmetric key so the verifier's algorithm check can be exercised.

Plan 04 reuses it for the bank live tests.
