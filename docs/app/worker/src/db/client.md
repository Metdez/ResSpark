# `app/worker/src/db/client.ts`

The first file of the single data-access module `app/worker/src/db/` (D-15). It builds the Supabase admin client that every Worker database call uses.

| Lines | What it does |
|-------|--------------|
| 1 | Imports `createClient` and the `SupabaseClient` type from `@supabase/supabase-js`. |
| 3 | Why the client is per request: a module-scope client would keep the secret key alive across requests and isolates (RESEARCH anti-pattern). |
| 4-6 | `createAdminClient(env)` takes only `SUPABASE_URL` and `SUPABASE_SECRET_KEY` from `Env`, so callers and tests can pass a minimal object. |
| 7-9 | Fails fast with `Missing SUPABASE_URL or SUPABASE_SECRET_KEY` if either is empty or absent, before any request is made (PLAT-03 empty edge). The message names the variables, never a value. |
| 10-12 | `createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })`. A Worker has no storage to persist a session in, and the secret key needs no refresh. The `sb_secret_` key runs as `service_role` and bypasses RLS, so every query built on this client must scope by `firm_id` or `user_id` in code (Pattern 2: verify, then scope). |

## Tests: `app/worker/src/db/client.test.ts`

Runs in the `worker-node` Vitest project (`pnpm -C app exec vitest run --project worker-node worker/src/db/client.test.ts`).

| Test | Proves |
|------|--------|
| throws when SUPABASE_URL is empty | the guard covers an empty URL |
| throws when SUPABASE_SECRET_KEY is empty | the guard covers an empty key |
| throws when both are undefined | the guard covers absent values (an `Env` without the secrets) |
| returns a client without making a network call | a valid env yields an object with `from()`, and the stubbed global `fetch` is never called, so creating a client is free and side-effect-free |
