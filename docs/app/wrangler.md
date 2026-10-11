# `app/wrangler.jsonc`

Input config for the `resspark` Worker (D-06). `vite build` (via `@cloudflare/vite-plugin`) reads it and writes the deployable output `dist/resspark/wrangler.json`; `wrangler deploy` picks that up automatically. Re-run `pnpm -C app cf-typegen` after any change so `worker-configuration.d.ts` stays in sync.

| Key | What it does |
|-----|--------------|
| `$schema` | Editor validation from the installed wrangler's schema. |
| `name` | Worker name `resspark`; with the free subdomain this yields `https://resspark.zh-a16.workers.dev`. |
| `account_id` | The Cloudflare account ("Zh@licom.ai's Account", Workers Paid). |
| `main` | Worker entry `./worker/src/index.ts` (Hono app + `queue` + `scheduled`). |
| `compatibility_date` / `compatibility_flags` | `2026-10-10` runtime, `nodejs_compat` for `node:` builtins (Buffer, crypto helpers later). |
| `assets.binding` | Exposes the static-asset store as `env.ASSETS`; without it `wrangler types` emits no `ASSETS` member and the SPA fallback in `index.ts` cannot compile. |
| `assets.not_found_handling` | `single-page-application`: unknown paths that reach the asset layer get `index.html` with 200. |
| `assets.run_worker_first` | `/api/*`, `/webhooks/*`, `/c/*` hit the Worker before assets; everything else (e.g. `/admin`) is served straight from assets. `directory` is deliberately omitted because the Vite plugin supplies the client build. |
| `vars` | Demo-safety flags (D-19): `APP_ENV=sandbox`, `LOGICS_WRITE_ENABLED=false`, `LOGICS_TEST_CASE_IDS=""`. Phase 2 adds `LOGICS_MODE=fake` (fixture Logics cases; set it to `live` only after Settings → Integrations → Test connection succeeds, C1) and `RESEND_FROM=onboarding@resend.dev` (sender for request emails; Resend delivers it only to the account owner until a domain is verified, D-09). Plain strings; `cf-typegen` runs with `--strict-vars=false` so they type as `string`, not the literal `"false"`. |
| `secrets.required` | `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `CLIENT_LINK_HMAC_KEY` (D-07, Plan 05), and `INTEGRATION_ENC_KEY` (Phase 2, D-01: the AES-GCM key that seals `firm_integrations` credentials). `RESEND_API_KEY` is optional and deliberately not listed, so deploys stay green without a Resend key. `wrangler deploy` refuses to deploy if any is not set on the Worker, and `cf-typegen` adds them to `Env` as `string`. Values are set by `app/scripts/provision-secrets.mjs`; locally they come from git-ignored `app/.dev.vars`. |
| `ratelimits` | `LINK_RATE_LIMITER` (namespace `1001`, 20 requests per 60 s), the Workers Rate Limiting binding used by `worker/src/middleware/link-rate-limit.ts` to throttle `/c/:token` per client IP (D-18). Counters are per Cloudflare location. Deploy accepted it on 2026-10-11 (version `0547fa5f`); the middleware falls back to an in-memory window if the binding is ever absent. |
| `triggers.crons` | One cron `*/15 * * * *` handled by `scheduled` (Phase 2 fills it). |
| `queues` | Producer binding `JOBS` → `resspark-jobs`; consumer with batch size 1, 8 retries, concurrency 3, dead-letter `resspark-jobs-dlq`. Both queues were created with `wrangler queues create` on 2026-10-11. |
| `observability.logs.invocation_logs` | `false`: the platform's own per-request log records the URL, which would store `/c/<token>` (RESEARCH Pitfall 1, PLAT-08). `console.log` output from `logger.ts` is still collected. |

## Notes

- Deploy with `pnpm -C app run deploy`. Bare `pnpm deploy` is pnpm's workspace-deploy built-in and fails with `ERR_PNPM_NOTHING_TO_DEPLOY`.
- `app/worker/tsconfig.json` is the matching TypeScript project (`types: ["../worker-configuration.d.ts", "node"]`, `lib: ["ES2022"]`, no DOM) and is referenced from `app/tsconfig.json` so `tsc -b` covers the Worker.
