# `app/worker/test/auth.test.ts`

Unit tests (Vitest project `worker-node`) for `staffAuth` and `/api/admin/session`. They need no network and no secrets: run with `pnpm -C app test` or `pnpm -C app vitest run --project worker-node worker/test/auth.test.ts`.

## Setup (lines 1-80)

- `vi.mock('../src/db/staff')` and `vi.mock('../src/db/events')` replace `getStaffProfile` and `logEvent`, so no database is touched.
- `GOOD_URL` and `FOREIGN_URL` are two fake project URLs. `envFor(url)` builds an `Env` with only the two Supabase values the route reads.
- `beforeAll` generates two ES256 key pairs with `jose`. The project JWKS serves the project public key under `kid: 'project'`. The foreign JWKS serves an unrelated key under `kid: 'foreign'`, so a token signed by the foreign private key cannot verify.
- `token(key, opts)` signs a JWT with `sub`, `email`, `role`, and `app_metadata.firm_id`. Issuer and audience default to the good project and can be overridden.
- `beforeEach` stubs global `fetch` (which `jose`'s remote key set uses) to serve the JWKS for whichever project URL is requested, spies on `console.log` to capture the logger's line, and sets the default mocks: a matching admin profile and `logEvent` returning `42`.
- `afterEach` restores everything.

## Tests

| Group | Test | Proves |
|-------|------|--------|
| rejects | POST without authorization | 401 `unauthorized`, an `X-Request-Id` header, a log line with `error_code: 'unauthorized'`, and no `authorization` text in any log line |
| rejects | GET without authorization | 401 on the read path too |
| rejects | malformed bearer | 401 with no JWKS fetch |
| rejects | foreign key | 401 and no profile lookup (T-01-25) |
| rejects | wrong issuer / wrong audience | 401 even when the signature is valid |
| scopes | no profile | 403 `forbidden`; the lookup used the verified `sub` |
| scopes | cross-firm profile | 403 and no event written (T-01-26) |
| route | POST signed_in | 200 `{ ok: true, event_id: 42 }` and the exact `logEvent` input |
| route | body firm_id/actor_id ignored | `logEvent` still gets the verified firm and user |
| route | unknown event / empty body / non-JSON | 400 `bad_request`, `logEvent` never called (T-01-30) |
| route | GET | the identity built from the profile and the JWT email |
