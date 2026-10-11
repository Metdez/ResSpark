# `app/worker/test/signup-disabled.test.ts`

A live test against the Supabase project. It proves the D-14 account model: nobody can self-register, and an admin-created staff account can still sign in. It runs in the `worker-node` Vitest project through `pnpm -C app run test:live`, which loads `app/.dev.vars`.

| Lines | What it does |
|-------|--------------|
| 1-3 | supabase-js, `node:crypto` for random probe credentials, and Vitest. |
| 5-11 | Reads `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `DEMO_STAFF_EMAIL`, and `DEMO_STAFF_PASSWORD` from the environment. These are written by `provision-secrets.mjs` and `create-staff.mjs`. `FIRM` is the ValorTax firm id. |
| 13 | `describe.skipIf(...)`: without the env the suite is reported as skipped, not failed, so plain `pnpm test` stays green. A skip under `test:live` means the env did not load. |
| 14 | `client()` builds a fresh publishable-key client with `persistSession: false`. This is exactly what an anonymous browser holds. |
| 16-26 | `signUp` with a random `probe-<hex>@resspark.test` address must return an error whose `code` is `signup_disabled` (or whose message contains `Signups not allowed`), and no user. Because the call is refused, no probe accounts accumulate. |
| 28-39 | `signInWithPassword` with the demo staff credentials must succeed. It checks for a non-empty `access_token` and `app_metadata.firm_id` equal to the ValorTax firm (the claim Plan 06 relies on), then calls `signOut()`. |

Result on 2026-10-11: 2 passed, 0 skipped.
