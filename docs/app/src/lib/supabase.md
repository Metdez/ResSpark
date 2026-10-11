# `app/src/lib/supabase.ts`

The SPA's single Supabase client. A copy of the shape of `src/frontend/src/supabase/client.ts`: fail fast on missing env, one named export (D-07).

| Lines | What it does |
|-------|--------------|
| 1 | Pulls in Vite's `import.meta.env` types. |
| 2 | `createClient` from `@supabase/supabase-js`. |
| 4-5 | Reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` at build time. Only the publishable key ships to the browser, never the secret key. |
| 7-9 | Throws `Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY` at module load if either is absent, so a misconfigured build fails loudly rather than talking to nothing. |
| 11-12 | `supabase` client with the library defaults `persistSession: true` and `autoRefreshToken: true`, so a staff session survives a page refresh (PLAT-07 groundwork). |

## Notes

- Because this module throws at load, nothing on a public path imports it eagerly. `lib/api.ts` loads it lazily inside `try/catch`. See `api.md`.
- Sign-in (Plan 06) and the `_shell` guard import it directly. Those paths need a configured build anyway.

## Tests

- No direct test: constructing a real client needs live env. `api.test.ts` and `sandbox-banner.test.tsx` replace it with `vi.mock('@/lib/supabase', ...)`, so no real client is ever built in tests.
