# `app/` operating notes

How the ResSpark platform app is laid out, how its CLIs must be invoked so secrets stay out of the terminal, which secret NAMES exist (values are never written here), and which checks gate a commit.

## Layout

- `app/src` — React + Vite SPA with two route trees: `/admin/*` (staff) and `/c/*` (client).
- `app/worker` — Hono API Worker: serves the SPA assets, `/api/*`, `/webhooks/*`, the queue consumer, and the cron handler.
- `app/scripts` — Node CLI utilities (hygiene gate, size gate, migrations, staff creation, secret provisioning).
- `supabase/migrations` — additive SQL migrations, applied in order by `app/scripts/db-migrate.mjs`.
- `docs/app` — companion Markdown for every code file under `app/`, mirroring the source path.

## CLI rules

1. **wrangler, and any command that needs `CLOUDFLARE_API_TOKEN`**, runs as `npx -y dotenv-cli -- <cmd>` from the repo root, or through the `app/package.json` wrappers that pass `-e ../.env`. The token is loaded into the child process only; it is never echoed, logged, or passed on the command line. A Bash hook blocks any command whose text names `.env` or `.dev.vars`, so do not `cat`, `grep`, or `source` those files.
2. **The Supabase CLI** runs as `npx -y supabase@2.120.0 ...` from a directory that contains neither the repo root `.env` nor a `supabase/` folder — the CLI fails to parse the root `.env` (RESEARCH F-10). `app/scripts/lib/supabase-cli.mjs` (Plan 04) does this with a temporary working directory and absolute `-f` paths, e.g. `supabase db query --linked --project-ref zvkphuikjpwoauqdimcf -f <absolute path>`.

## Secrets

Names only. Values live in the places listed and nowhere else.

| Name | Where it lives | Set by |
|------|----------------|--------|
| `SUPABASE_URL` | Worker secret + `app/.dev.vars` | `app/scripts/provision-secrets.mjs` (Plan 05) |
| `SUPABASE_SECRET_KEY` | Worker secret + `app/.dev.vars` | `app/scripts/provision-secrets.mjs` (Plan 05) |
| `CLIENT_LINK_HMAC_KEY` | Worker secret + `app/.dev.vars` | `app/scripts/provision-secrets.mjs` (Plan 05) |
| `VITE_SUPABASE_URL` | `app/.env` (copied from `src/frontend/.env`) | developer copies the file; never printed |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `app/.env` (copied from `src/frontend/.env`) | developer copies the file; never printed |
| `CLOUDFLARE_API_TOKEN` | repo root `.env` | developer; never printed |
| `RESEND_API_KEY` | reserved — not set in Phase 1 | Phase 2 (email) |
| `MAIL_FROM` | reserved — not set in Phase 1 | Phase 2 (email) |
| `TRUV_CLIENT_ID` | reserved — not set in Phase 1 | Phase 4 (payroll) |
| `TRUV_SECRET` | reserved — not set in Phase 1 | Phase 4 (payroll) |
| `LOGICS_API_KEY` | reserved — not set in Phase 1 | Phase 2 (Logics lookup) |
| `LOGICS_SECRET_TOKEN` | reserved — not set in Phase 1 | Phase 2 (Logics lookup) |

## Checks

- `pnpm check` runs `pnpm -C app check`, which starts with `node scripts/check-file-sizes.mjs` (Plan 02 extends it with `tsc -b`, `eslint .`, and `pnpm test`).
- `pnpm hygiene` runs `bash app/scripts/hygiene-check.sh` — the PLAT-06 gate (ignore rules, no tracked build output, one lockfile, engines, size gate, 500/501 boundary self-test).
- `app/scripts/check-file-sizes.mjs` fails on any code file over 500 lines. It excludes only `src/components/ui/**` (vendored shadcn), `routeTree.gen.ts`, and `worker-configuration.d.ts`; the limit itself is a CLAUDE.md rule, not a setting.

## Deployed URL

https://resspark.zh-a16.workers.dev — Worker `resspark` on the free `*.workers.dev` subdomain (D-06). One `pnpm -C app run deploy` ships the SPA and the API together; `node app/scripts/smoke.mjs https://resspark.zh-a16.workers.dev` proves `/admin`, `/api/config`, and the Worker 404 JSON for `/api/*` and `/webhooks/*`.

Note: `pnpm deploy` (without `run`) is pnpm's own workspace-deploy command and fails with `ERR_PNPM_NOTHING_TO_DEPLOY`; always use `pnpm -C app run deploy`.
