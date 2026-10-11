# `app/` operating notes

How the ResSpark platform app is laid out, how its CLIs must be invoked so secrets stay out of the terminal, which secret NAMES exist (values are never written here), and which checks gate a commit. Start here as a new developer.

## Layout

- `app/src` — React + Vite SPA with two route trees: `/admin/*` (staff) and `/c/*` (client).
- `app/worker` — Hono API Worker: serves the SPA assets, `/api/*`, `/webhooks/*`, the queue consumer, and the cron handler.
- `app/scripts` — Node CLI utilities (hygiene gate, size gate, migrations, staff creation, secret provisioning).
- `supabase/migrations` — additive SQL migrations, applied in order by `app/scripts/db-migrate.mjs`.
- `docs/app` — companion Markdown for every code file under `app/`, mirroring the source path.

## Deployed URL

https://resspark.zh-a16.workers.dev — Worker `resspark` on the free `*.workers.dev` subdomain (D-06). One `pnpm -C app run deploy` ships the SPA and the API together; `node app/scripts/smoke.mjs https://resspark.zh-a16.workers.dev` proves `/admin`, `/api/config`, and the Worker 404 JSON for `/api/*` and `/webhooks/*`.

Note: `pnpm deploy` (without `run`) is pnpm's own workspace-deploy command and fails with `ERR_PNPM_NOTHING_TO_DEPLOY`; always use `pnpm -C app run deploy`.

## Commands

Run from the repo root. Every script that needs a secret loads it with `dotenv -e` inside `app/package.json`, so no secret file is named on the command line.

- **dev** — `pnpm -C app run dev`: Vite dev server with the Worker running in workerd via `@cloudflare/vite-plugin`.
- **build** — `pnpm -C app run build`: `tsc -b` then `vite build` (SPA + Worker bundle).
- **check** — `pnpm -C app run check`: 500-line size gate, golden-fixture freshness (`python ../src/tools/export_golden_fixtures.py --check`), `tsc -b`, `eslint .`, then `pnpm test`. Must be green before a commit.
- **test** — `pnpm -C app run test`: Vitest `web` (jsdom) + `worker-node` projects. `pnpm -C app run test:workerd` runs the Workers-runtime project (spike a).
- **test:live** — `pnpm -C app run test:live`: live suites in `app/worker/test` against the real Supabase project (RLS, events, sign-up disabled). Env-gated: they skip when the vars are absent.
- **test:live:file** — `pnpm -C app run test:live:file worker/test/<file>.test.ts`: one live file with the same env files as `test:live`, so no env file is named on the command line.
- **deploy** — `pnpm -C app run deploy`: builds and runs `wrangler deploy` with `CLOUDFLARE_API_TOKEN` loaded from the root env file. Deploy refuses to run if a name in `secrets.required` is missing on the Worker.
- **smoke** — `pnpm -C app run smoke https://resspark.zh-a16.workers.dev`: post-deploy proof (4 checks).
- **db:migrate** — `pnpm -C app run db:migrate` (or `node app/scripts/db-migrate.mjs`): applies pending `supabase/migrations/*.sql` in order and records them in `public.app_migrations`. `--status`, `--dry-run`, and `--query "<sql>"` are also accepted.
- **secrets:provision** — `pnpm -C app run secrets:provision`: sets the three Worker secrets over stdin and appends missing keys to `app/.dev.vars`. Re-runs keep the existing `CLIENT_LINK_HMAC_KEY`.
- **staff:create** — `pnpm -C app run staff:create --email <e> --name <n> [--role staff|admin]`: creates a staff user with `app_metadata` claims and a `staff_profiles` row.
- **auth:config-push** — `pnpm -C app run auth:config-push`: pushes tracked `supabase/config.toml` (public sign-up off) to the live project.
- **questions:reconcile** — `pnpm -C app run questions:reconcile`: diffs `src/questions.py` ids against `question_definitions` (see Question contract).
- **wrangler** — `pnpm -C app wrangler <args>`: wrangler with the Cloudflare token loaded, e.g. `pnpm -C app wrangler secret list` (names only).
- **spike** — `pnpm -C app run spike <file>`: runs a one-off Node script with `app/.dev.vars` loaded. Used only for the Phase 1 spike scripts under `.planning/phases/01-foundation-staff-sign-in/spikes/`.

## CLI rules (D-08)

1. **wrangler, and any command that needs `CLOUDFLARE_API_TOKEN`**, runs as `npx -y dotenv-cli -- <cmd>` from the repo root, or through the `app/package.json` wrappers that pass `-e ../.env`. The token is loaded into the child process only; it is never echoed, logged, or passed on the command line. A Bash hook blocks any command whose text names `.env` or `.dev.vars`, so do not `cat`, `grep`, or `source` those files.
2. **The Supabase CLI** runs as `npx -y supabase@2.120.0 ...` from a directory that contains neither the repo root `.env` nor a `supabase/` folder — the CLI fails to parse the root `.env` (RESEARCH F-10). `app/scripts/lib/supabase-cli.mjs` (Plan 04) does this with a temporary working directory and absolute `-f` paths, e.g. `supabase db query --linked --project-ref zvkphuikjpwoauqdimcf -f <absolute path>`. It authenticates with the CLI's stored login, a classic full-account token (threat T-01-18, accepted for this developer machine). Create a scoped personal access token and set `SUPABASE_ACCESS_TOKEN` before running these scripts in CI.

## Secrets

Names only. Values live in the places listed and nowhere else. Only the first three are in `app/wrangler.jsonc` `secrets.required`; reserved names are deliberately left out so deploys stay green until a key exists.

| Name | Where it lives | Set by |
|------|----------------|--------|
| `SUPABASE_URL` | Worker secret + `app/.dev.vars` | `app/scripts/provision-secrets.mjs` (Plan 05) |
| `SUPABASE_SECRET_KEY` | Worker secret + `app/.dev.vars` | `app/scripts/provision-secrets.mjs` (Plan 05) |
| `CLIENT_LINK_HMAC_KEY` | Worker secret + `app/.dev.vars` | `app/scripts/provision-secrets.mjs` (Plan 05) |
| `SUPABASE_PUBLISHABLE_KEY` | `app/.dev.vars` (live tests, spike c) | `app/scripts/provision-secrets.mjs` (Plan 05) |
| `DEMO_STAFF_EMAIL`, `DEMO_STAFF_PASSWORD` | `app/.dev.vars` | `app/scripts/create-staff.mjs` (Plan 05) |
| `STAFF_PASSWORD__<email>` | `app/.dev.vars`, one per staff user | `app/scripts/create-staff.mjs` (Plan 05) |
| `VITE_SUPABASE_URL` | `app/.env` (copied from `src/frontend/.env`) | developer copies the file; never printed |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `app/.env` (copied from `src/frontend/.env`) | developer copies the file; never printed |
| `CLOUDFLARE_API_TOKEN` | repo root `.env` | developer; never printed |
| `RESEND_API_KEY` | reserved — not set in Phase 1 | Phase 2 (email, spike d); user creates a Resend key |
| `MAIL_FROM` | reserved — not set in Phase 1 | Phase 2 (email, spike d); needs a verified sending domain |
| `TRUV_CLIENT_ID` | reserved — not set in Phase 1 | Phase 4 (payroll, spike e); `pnpm -C app wrangler secret put TRUV_CLIENT_ID` |
| `TRUV_SECRET` | reserved — not set in Phase 1 | Phase 4 (payroll, spike e); `pnpm -C app wrangler secret put TRUV_SECRET` |
| `LOGICS_API_KEY` | reserved — not set in Phase 1 | Phase 2 (Logics lookup) |
| `LOGICS_SECRET_TOKEN` | reserved — not set in Phase 1 | Phase 2 (Logics lookup) |

`app/.dev.vars.example` lists every name above that belongs in `app/.dev.vars`, with the reserved ones commented out.

## Workers plan notes

- The Cloudflare account is on **Workers Paid** as of 2026-10-10 (verified via the subscriptions API, CONTEXT D-06 update).
- Limits that apply: 30 s CPU per invocation, 1,000 subrequests per invocation.
- Queues and cron are available. Plan 03 created `resspark-jobs` and its dead-letter queue `resspark-jobs-dlq`, with the `JOBS` producer and consumer bound to `resspark`, and a `*/15 * * * *` cron trigger.
- Cloudflare Email Sending is available on this plan but needs a sending domain on Cloudflare DNS, which the firm does not have yet. Phase 2 sends email through Resend over `fetch` (spike d).
- Platform invocation logs are off (`observability.logs.invocation_logs: false`) so URLs carrying client-link tokens are never logged; the Worker's allowlisted logger is the only log sink.

## Checks

- `pnpm check` runs `pnpm -C app check`, which starts with `node scripts/check-file-sizes.mjs`, then `python ../src/tools/export_golden_fixtures.py --check` (fails when `app/worker/test/fixtures/engine/golden.json` is stale against the Python oracle; needs Python 3.11 on PATH), and continues with `tsc -b`, `eslint .`, and `pnpm test`.
- `pnpm hygiene` runs `bash app/scripts/hygiene-check.sh` — the PLAT-06 gate (ignore rules, no tracked build output, one lockfile, engines, size gate, 500/501 boundary self-test, no `sb_secret_` in the client bundle).
- `app/scripts/check-file-sizes.mjs` fails on any code file over 500 lines. It excludes only `src/components/ui/**` (vendored shadcn), `routeTree.gen.ts`, and `worker-configuration.d.ts`; the limit itself is a CLAUDE.md rule, not a setting.

## Question contract

`question_definitions` has 28 rows = `src/questions.py` (28 ids, byte-identical; `questions:reconcile` reports an empty diff, Plan 04). CLAUDE.md and PROJECT.md say "32 questions"; that number is stale. Open question for the user: should CLAUDE.md/PROJECT.md be corrected to 28, or are 4 questions missing from `src/questions.py`? Nothing was inserted or removed in Phase 1.

## Spikes

The Phase 1 day-one spike results (a)–(f) — Vitest Workers plugin, JWT verification, signed Storage upload without a session, email provider, Truv sandbox order, Logics questions for Andrew — are in [`.planning/phases/01-foundation-staff-sign-in/01-SPIKES.md`](../../.planning/phases/01-foundation-staff-sign-in/01-SPIKES.md).
