# `app/worker/test/config.test.ts`

Routing tests for the Worker under plain node (`worker-node` project) using Hono's `app.request(path, init, env)` — no workerd needed.

| Lines | What it does |
|-------|--------------|
| 1-2 | Vitest and the named `app` export from `worker/src/index.ts`. |
| 4-15 | `fakeAssets` (a `vi.fn` returning an HTML `Response`) and `MOCK_ENV`: sandbox vars plus `ASSETS: { fetch: fakeAssets }`, cast to `Env`. |
| 18-19 | Silences the logger's `console.log` for each test and restores spies afterwards. |
| 21-29 | `GET /api/config` → 200 and exactly `{ app_env: 'sandbox', logics_write_enabled: false, app_name: 'ResSpark' }`. |
| 31-36 | `GET /webhooks/x` → 404 with `error.code === 'not_found'` (the Worker answers, not `index.html`). |
| 38-44 | `GET /c/` → the asset binding was called (SPA fallback) and the response carries `Cache-Control: no-store`, `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`. |

## Notes

- Lives under `worker/test/` rather than next to `index.ts` because it exercises the whole middleware chain, not one module (D-23: standalone test, own companion doc).
- Plan 07 adds the `/c/:token` cases here; Plan 06 adds `/api/admin/session`.
