# `app/worker/src/middleware/client-csp.test.ts`

Unit tests for `client-csp.ts` on a minimal Hono app that mounts `clientCsp` on `/c/*` and answers every path with `ok`.

- `buildClientCsp({ SUPABASE_URL: 'https://abc.supabase.co' })` contains the exact `connect-src` (Truv, Plaid, the Supabase origin, Storage), `script-src`, `frame-src` and `frame-ancestors 'none'`.
- `http://localhost:5173/c/` gets no header (the Vite dev `shortcut:`).
- `https://resspark.example.workers.dev/c/` gets exactly `buildClientCsp(env)`.
- `/admin/` on the same host gets none.
