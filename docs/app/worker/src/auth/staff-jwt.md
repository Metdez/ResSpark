# `app/worker/src/auth/staff-jwt.ts`

Verifies a Supabase staff access token inside the Worker (D-15). It replaces spike (b): `@supabase/server` adapters are deprecated, so the Worker uses `jose` directly, as the Supabase JWT docs show.

| Lines | What it does |
|-------|--------------|
| 1 | `createRemoteJWKSet` (fetches and caches a JSON Web Key Set over HTTPS), `jwtVerify`, and the `JWTPayload` type from `jose` 6. |
| 3-8 | `StaffClaims`: the verified payload with `sub` (the user UUID), optional `email`, the Postgres `role` claim (`authenticated`), and `app_metadata` (`firm_id`, `role`). Only `app_metadata` is trusted for authorization; `user_metadata` is user-editable and never read. |
| 10-11 | `keySets`: a module-scope `Map` from issuer to key set. It holds public keys only, so sharing it across requests in one isolate is safe and saves a JWKS fetch per request. Keying by issuer keeps tests that use several fake projects apart. |
| 13-14 | `verifyStaffJwt(token, supabaseUrl)`. Any failure throws; the caller (`staffAuth`) turns every throw into a 401. |
| 15 | The issuer Supabase writes into `iss`: `${SUPABASE_URL}/auth/v1`. |
| 16-20 | Builds the key set for `${issuer}/.well-known/jwks.json` on first use. `jose` refetches when it sees an unknown `kid`, with a cooldown, so a key rotation is picked up without a deploy. |
| 21-25 | `jwtVerify` checks the signature, `exp`/`nbf`, `iss` equals the project issuer, `aud` equals `authenticated`, and pins `algorithms` to `ES256`. The project signs with one ES256 (P-256) key (F-3), so pinning blocks algorithm-confusion tokens (T-01-25). |
| 26 | Rejects a token without a string `sub`. Every Supabase user token has one; the check keeps the returned type honest. |
| 27 | Returns the payload as `StaffClaims`. |

## Notes

- A malformed token (`not.a.jwt`) fails inside `jose` before any network call.
- Deleted or banned users keep a valid token until it expires (default 1 hour). `staffAuth` re-reads `staff_profiles` on every request, so removing the profile row cuts access at once. Full revocation is a Phase 8 item.
- Tests: `app/worker/test/auth.test.ts` (fabricated ES256 keys behind a stubbed `fetch`) and `app/worker/test/session.test.ts` (the live project JWKS).
