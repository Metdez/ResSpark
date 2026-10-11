# `app/scripts/smoke.mjs`

Dependency-free Node (≥22 `fetch`) script that proves a deployed ResSpark URL serves the SPA and the API from one Worker (PLAT-01). Usage: `node app/scripts/smoke.mjs <baseUrl> [--auth]`, or `pnpm -C app run smoke:auth <baseUrl> --auth`, which loads the env files the `--auth` checks need without naming them in a shell command.

| Lines | What it does |
|-------|--------------|
| 3-8 | Parses argv: the first non-flag argument is the base URL; missing → usage line on stderr and exit 1. |
| 9-10 | Strips a trailing slash; `--auth` enables checks marked `auth: true`. |
| 12 | `isObject` guard, same shape as the SPA's. |
| 14-18 | `expectJson(res, status, test)`: asserts the status, parses JSON, and runs a predicate on the body; throws a one-line reason otherwise. |
| 20-21 | `isNotFoundEnvelope`: body is `{ error: { code: 'not_found', … } }`. |
| 23-43 | `staffToken()` (Plan 06): reads `SUPABASE_URL ?? VITE_SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY ?? VITE_SUPABASE_PUBLISHABLE_KEY`, `DEMO_STAFF_EMAIL`, and `DEMO_STAFF_PASSWORD` from `process.env`; fails with a one-line reason naming the variables (never their values) when any is missing; signs in once with `POST {url}/auth/v1/token?grant_type=password` and the publishable key in the `apikey` header; caches the access token for the other checks. The token is never printed. |
| 44-46 | `session(init)`: a fetch to `<base>/api/admin/session`; the `signed_in` body. |
| 48-79 | `checks` — the array later plans append to. `/admin` → 200, `text/html`, body contains `<div id="root"`; `/api/config` → 200 with string `app_env` and boolean `logics_write_enabled`; `/webhooks/smoke-probe` and `/api/nope` → 404 JSON `not_found` from the Worker (never `index.html`). |
| 80-104 | `--auth` checks (PLAT-04/PLAT-07 on the deployed Worker): `auth signed_in` posts `{ event: 'signed_in' }` with the bearer and expects 200 `ok: true` with a numeric `event_id` (one real `staff.signed_in` row per run); `auth session` expects `GET` 200 with a string `firm_id`; `auth 401 without token` expects 401 `error.code === 'unauthorized'`. A failure message can include the response body, which never contains the token. |
| 107-118 | Runs each applicable check, prints `ok <name>` or `FAIL <name>: <reason>`, exits 1 if any failed. |

## Notes

- Run from the repo root after `pnpm -C app run deploy`; the Plan 03 acceptance command is `node app/scripts/smoke.mjs "$(grep -oE 'https://[a-z0-9.-]+\.workers\.dev' docs/app/README.md | head -1)"`.
- Checks are independent; one failure does not stop the others, so the output lists every broken surface.
