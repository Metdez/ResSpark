# `app/worker/src/routes/config.ts`

`GET /api/config`: the display-only flags the SPA reads to decide whether to show the SANDBOX banner (D-19).

| Lines | What it does |
|-------|--------------|
| 1 | Hono. |
| 3-10 | `configRoute`, a sub-app mounted at `/api/config` by `index.ts`. Returns `{ app_env, logics_write_enabled, app_name }`: `app_env` is the `APP_ENV` var as-is, `logics_write_enabled` is `true` only when the var is exactly the string `'true'`, `app_name` is the fixed `'ResSpark'`. |

## Notes

- Nothing here is a secret; the Worker-side `logicsWriteGuard` is the enforcement point, this endpoint is UX.
- Response shape is guarded in the SPA by `isConfig` in `app/src/lib/api.ts`.

## Tests

- Covered by `app/worker/test/config.test.ts` (`app.request('/api/config', {}, MOCK_ENV)` → 200 and the exact body).
