# `app/scripts/smoke.mjs`

Dependency-free Node (≥22 `fetch`) script that proves a deployed ResSpark URL serves the SPA and the API from one Worker (PLAT-01). Usage: `node app/scripts/smoke.mjs <baseUrl> [--auth]`.

| Lines | What it does |
|-------|--------------|
| 3-8 | Parses argv: the first non-flag argument is the base URL; missing → usage line on stderr and exit 1. |
| 9-10 | Strips a trailing slash; `--auth` enables checks marked `auth: true` (none yet; Plan 06 adds them). |
| 12 | `isObject` guard, same shape as the SPA's. |
| 14-18 | `expectJson(res, status, test)`: asserts the status, parses JSON, and runs a predicate on the body; throws a one-line reason otherwise. |
| 20-21 | `isNotFoundEnvelope`: body is `{ error: { code: 'not_found', … } }`. |
| 23-55 | `checks` — the array later plans append to. `/admin` → 200, `text/html`, body contains `<div id="root"`; `/api/config` → 200 with string `app_env` and boolean `logics_write_enabled`; `/webhooks/smoke-probe` and `/api/nope` → 404 JSON `not_found` from the Worker (never `index.html`). |
| 57-68 | Runs each applicable check, prints `ok <name>` or `FAIL <name>: <reason>`, exits 1 if any failed. |

## Notes

- Run from the repo root after `pnpm -C app run deploy`; the Plan 03 acceptance command is `node app/scripts/smoke.mjs "$(grep -oE 'https://[a-z0-9.-]+\.workers\.dev' docs/app/README.md | head -1)"`.
- Checks are independent; one failure does not stop the others, so the output lists every broken surface.
