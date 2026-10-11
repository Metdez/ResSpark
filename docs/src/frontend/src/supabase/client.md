# `src/frontend/src/supabase/client.ts`

Browser Supabase client for the Vite frontend. Nothing imports it yet.

| Lines | What it does |
|-------|--------------|
| 1 | Pulls in Vite's `import.meta.env` types. |
| 2 | Imports `createClient` from `@supabase/supabase-js`. |
| 4-5 | Reads the project URL and publishable key from Vite env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`). Set them in `src/frontend/.env` (git-ignored); see `.env.example`. |
| 7-9 | Fails fast with a clear message if either variable is missing, so a misconfigured build does not silently talk to nothing. |
| 11 | Exports one shared client instance. |

## Notes

- The publishable key is meant for browsers, but it is only safe if Row Level Security policies exist on every table the client touches. None exist yet; this repo's `src/schemas/` has no RLS.
- Never put the Postgres password or a `service_role`/secret key in the frontend.
- The Python backend still uses `DATABASE_URL` (plain Postgres), not this client.
- The Next.js `@supabase/ssr` helpers from the Supabase quickstart were intentionally not used: this app is Vite, not Next.js.
