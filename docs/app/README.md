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
- **smoke** — `pnpm -C app run smoke https://resspark.zh-a16.workers.dev`: post-deploy proof without credentials (`/admin`, `/api/config`, the 404s, `/c/` pages and headers, the `/api/c` 401s).
- **smoke:auth** — `pnpm -C app run smoke:auth https://resspark.zh-a16.workers.dev --auth`: adds the staff and client-link checks. Add `--client-flow` for the Phase 2 acceptance run: lookup, confirm, create, send, open the link, Start, heartbeat, revoke, and the dead link, on fixture case 900003 (see `docs/app/scripts/smoke.md`).
- **db:migrate** — `pnpm -C app run db:migrate` (or `node app/scripts/db-migrate.mjs`): applies pending `supabase/migrations/*.sql` in order and records them in `public.app_migrations`. `--status`, `--dry-run`, and `--query "<sql>"` are also accepted.
- **secrets:provision** — `pnpm -C app run secrets:provision`: sets the five required Worker secrets over stdin and appends missing keys to `app/.dev.vars`. Re-runs keep the existing `CLIENT_LINK_HMAC_KEY`, `INTEGRATION_ENC_KEY`, and `TOKEN_ENC_KEY_1`.
- **secrets:provider** — `pnpm -C app run secrets:provider plaid` (or `truv`): prompts for that provider's two vendor keys with echo off (or reads them line by line from piped stdin) and sets them on the Worker. See § USER ACTION REQUIRED (Phase 4).
- **staff:create** — `pnpm -C app run staff:create --email <e> --name <n> [--role staff|admin]`: creates a staff user with `app_metadata` claims and a `staff_profiles` row.
- **auth:config-push** — `pnpm -C app run auth:config-push`: pushes tracked `supabase/config.toml` (public sign-up off) to the live project.
- **questions:reconcile** — `pnpm -C app run questions:reconcile`: diffs `src/questions.py` ids against `question_definitions` (see Question contract).
- **wrangler** — `pnpm -C app wrangler <args>`: wrangler with the Cloudflare token loaded, e.g. `pnpm -C app wrangler secret list` (names only).
- **spike** — `pnpm -C app run spike <file>`: runs a one-off Node script with `app/.dev.vars` loaded. Used only for the Phase 1 spike scripts under `.planning/phases/01-foundation-staff-sign-in/spikes/`.

## CLI rules (D-08)

1. **wrangler, and any command that needs `CLOUDFLARE_API_TOKEN`**, runs as `npx -y dotenv-cli -- <cmd>` from the repo root, or through the `app/package.json` wrappers that pass `-e ../.env`. The token is loaded into the child process only; it is never echoed, logged, or passed on the command line. A Bash hook blocks any command whose text names `.env` or `.dev.vars`, so do not `cat`, `grep`, or `source` those files.
2. **The Supabase CLI** runs as `npx -y supabase@2.120.0 ...` from a directory that contains neither the repo root `.env` nor a `supabase/` folder — the CLI fails to parse the root `.env` (RESEARCH F-10). `app/scripts/lib/supabase-cli.mjs` (Plan 04) does this with a temporary working directory and absolute `-f` paths, e.g. `supabase db query --linked --project-ref zvkphuikjpwoauqdimcf -f <absolute path>`. It authenticates with the CLI's stored login, a classic full-account token (threat T-01-18, accepted for this developer machine). Create a scoped personal access token and set `SUPABASE_ACCESS_TOKEN` before running these scripts in CI.

## Secrets

Names only. Values live in the places listed and nowhere else. Only the five required keys (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `CLIENT_LINK_HMAC_KEY`, `INTEGRATION_ENC_KEY`, `TOKEN_ENC_KEY_1`) are in `app/wrangler.jsonc` `secrets.required`. Optional and vendor names are deliberately left out so deploys stay green until a key exists.

| Name | Where it lives | Set by |
|------|----------------|--------|
| `SUPABASE_URL` | Worker secret + `app/.dev.vars` | `app/scripts/provision-secrets.mjs` (Plan 05) |
| `SUPABASE_SECRET_KEY` | Worker secret + `app/.dev.vars` | `app/scripts/provision-secrets.mjs` (Plan 05) |
| `CLIENT_LINK_HMAC_KEY` | Worker secret + `app/.dev.vars` | `app/scripts/provision-secrets.mjs` (Plan 05) |
| `INTEGRATION_ENC_KEY` | Worker secret + `app/.dev.vars` (required) | `app/scripts/provision-secrets.mjs` (Phase 2 Plan 03); kept if it already exists, because rotating it orphans every stored firm credential |
| `SUPABASE_PUBLISHABLE_KEY` | `app/.dev.vars` (live tests, spike c) | `app/scripts/provision-secrets.mjs` (Plan 05) |
| `DEMO_STAFF_EMAIL`, `DEMO_STAFF_PASSWORD` | `app/.dev.vars` | `app/scripts/create-staff.mjs` (Plan 05) |
| `STAFF_PASSWORD__<email>` | `app/.dev.vars`, one per staff user | `app/scripts/create-staff.mjs` (Plan 05) |
| `VITE_SUPABASE_URL` | `app/.env` (copied from `src/frontend/.env`) | developer copies the file; never printed |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `app/.env` (copied from `src/frontend/.env`) | developer copies the file; never printed |
| `CLOUDFLARE_API_TOKEN` | repo root `.env` | developer; never printed |
| `RESEND_API_KEY` | optional Worker secret — not set until the user creates a Resend key | `pnpm -C app wrangler secret put RESEND_API_KEY` |
| `RESEND_FROM` | `wrangler.jsonc` var (not a secret), default `onboarding@resend.dev` | Resend delivers that sender only to the account owner until a domain is verified (D-09) |
| `LOGICS_MODE` | `wrangler.jsonc` var (not a secret) | `fake` for the demo; `live` after Test connection succeeds (see § Logics mode) |
| `TOKEN_ENC_KEY_1` | Worker secret + `app/.dev.vars` (required) | `pnpm -C app secrets:provision` (Phase 4, D-15). It seals Plaid access tokens in `connection_secrets` and is kept if it already exists, because rotating it orphans every stored token. |
| `PLAID_CLIENT_ID`, `PLAID_SECRET` | optional Worker secrets + `app/.dev.vars` | `pnpm -C app secrets:provider plaid`, entered at the prompt (echo off). Without them, bank `/start` returns `provider_not_configured` and the portal offers manual upload only. |
| `TRUV_CLIENT_ID`, `TRUV_SECRET` | optional Worker secrets + `app/.dev.vars` | `pnpm -C app secrets:provider truv`, entered at the prompt. `TRUV_SECRET` is also the webhook signing key. Without them, payroll `/start` returns `provider_not_configured`. |
| `PLAID_ENV`, `TRUV_TEMPLATE_ID`, `PLAID_REMOVE_AFTER_DAYS`, `BANK_PROVIDER` | `wrangler.jsonc` vars (not secrets) | `sandbox`, `""`, `30`, `plaid` (Phase 4, D-15) |
| `DOCUSEAL_API_KEY` | optional Worker secret + `app/.dev.vars` | `pnpm -C app secrets:provider docuseal`, entered at the prompt. The API key from the DocuSeal Console in Test Mode (Phase 6, D-10). |
| `DOCUSEAL_WEBHOOK_SECRET` | optional Worker secret + `app/.dev.vars` | same prompt. The HMAC secret configured on the DocuSeal Console webhook (Phase 6). |
| `SMARTY_AUTH_ID`, `SMARTY_AUTH_TOKEN` | optional Worker secrets + `app/.dev.vars` | `pnpm -C app secrets:provider smarty`. A Smarty secret key pair with US Autocomplete Pro and US Street access (D-03). Without them the address step answers `provider_not_configured` and the client enters the address by hand, unverified (D-06). |
| `DOCUSEAL_API_URL`, `DOCUSEAL_ENV` | `wrangler.jsonc` vars (not secrets) | `https://api.docuseal.com`, `test` (Phase 6, D-10) |

`app/.dev.vars.example` lists every name above that belongs in `app/.dev.vars`, with empty values.

Logics credentials are no longer environment secrets: each firm's API key and secret token are entered in Settings → Integrations and stored encrypted in `firm_integrations` (D-01), so the old `LOGICS_API_KEY` / `LOGICS_SECRET_TOKEN` names are gone.

## Logics mode

The Worker var `LOGICS_MODE` picks where staff lookups go. In `fake` (the default in `app/wrangler.jsonc`) the Worker serves four synthetic fixture cases (900001-900004, `example.com` emails, `555-010-xxxx` phones) and **fixtures always win, even when tested credentials are stored**, so a demo can never read the real tenant (C1). Every lookup response carries `mode`, so the SPA can label fixture data.

USER ACTION to switch to real Logics:

1. In Logics, copy an API key with GET (`case.read`) permission (Dashboard → Security → API Key) and generate the secret token (Settings → Integrations → Generate Token).
2. Paste both into ResSpark Settings → Integrations (or `PUT /api/admin/integrations/logics` as a firm admin) and click Test connection. It must report success.
3. Set `"LOGICS_MODE": "live"` in `app/wrangler.jsonc` `vars` and redeploy with `pnpm -C app run deploy`.

In `live` mode a lookup needs stored credentials whose last test succeeded; otherwise it answers 409 `logics_not_configured`. Saving new credentials clears the last test result.

Pushing documents into Logics (Phase 5) has its own ordered USER ACTION runbook: [logics-live-switch.md](logics-live-switch.md) (write-scoped key and test CaseIDs from Andrew, Test connection, push settings, `LOGICS_TEST_CASE_IDS`, `LOGICS_WRITE_ENABLED`, then `LOGICS_MODE`). In fake mode a push needs only a ValorTax admin to turn on **Write enabled** in Settings → Integrations → Push settings.

## Demo script (Phase 2)

Runs end to end in fixture mode (`LOGICS_MODE=fake`), with no Logics credentials and no Resend key. The fixture cases use `example.com` emails and `555-010-xxxx` phones.

1. Open https://resspark.zh-a16.workers.dev/admin and sign in as the demo admin.
2. Click `Find a client` and type `(555) 010-0001`. Two cards appear, because the spouses on the fixture share that phone.
3. Confirm Jordan Rivera. The request builder opens.
4. In the builder, switch one item off and rename another, then click `Create request`.
5. On the request page, type the email with a typo (for example `jordan.rivera@gmial.com`) and accept the suggested fix.
6. Click `Send link`, then `Copy link`.
7. Open the copied link in a phone-sized private window. The client sees the firm, the agent, and one `Start` button.
8. Tap `Start`. The step list appears, with a status chip on each step.
9. Tap `View` on a step. The `Coming next` sheet opens; close it.
10. Back in admin, click `Email link`. It shows `Email not configured` until Resend is set up.
11. Tick the SMS consent checkbox.
12. Click `Revoke link`, then refresh the phone window. The client now sees the ask-your-agent page ("This link isn't active").

The same path, minus the clicks, is checked by `pnpm -C app run smoke:auth https://resspark.zh-a16.workers.dev --client-flow`. It uses fixture case 900003 and deletes its probe request afterwards.

## USER ACTION REQUIRED (Phase 2)

Phase 2 works in fixture mode today. These items need the user (or Andrew at ValorTax) before it runs against real data:

1. **Logics credentials.** Paste a Logics API key and secret token in Settings → Integrations and click Test connection; it must succeed. Then set `"LOGICS_MODE": "live"` in `app/wrangler.jsonc` and redeploy (see § Logics mode).
2. **Email.** Create a Resend API key and store it with `pnpm -C app wrangler secret put RESEND_API_KEY`. Verify a sending domain in Resend and set `RESEND_FROM` in `app/wrangler.jsonc` to an address on it. Until the domain is verified, Resend only delivers to the account owner.
3. **Questions for Andrew.** Which permission scopes the Logics API key should carry; the `FileCategoryID` to use for uploaded documents; and the `ActivityType` for the case notes ResSpark will write.
4. **Two open `shortcut:` questions in the Logics client.**
   - What `CaseInfo` returns for an unknown case id (`app/worker/src/integrations/logics/client.ts`). The code currently treats the undocumented answer as "not found".
   - Which phone format the `phone` lookup header accepts (`app/worker/src/integrations/logics/lookup.ts`). The code currently retries in the documented format.

## USER ACTION REQUIRED (Phase 4)

Phase 4 deploys and runs without any vendor key: payroll and bank steps show the manual-upload fallback. To turn on the live connections (Sandbox keys are the demo path):

1. **Keys.** Run `pnpm -C app secrets:provider plaid` and paste the Plaid Sandbox Client ID and Secret (Plaid Dashboard → Developers → Keys). Run `pnpm -C app secrets:provider truv` and paste the Truv Sandbox Client ID and Access Secret (Truv Dashboard → Development → Keys). The prompts do not echo. Values go only to the Worker and the git-ignored `app/.dev.vars`. Leave a prompt empty to skip that key.
2. **Plaid Dashboard.**
   - Developers → API → Allowed redirect URIs: add `https://resspark.zh-a16.workers.dev/c/return`.
   - Link → Link customization: create a Sandbox customization whose use case reads "Prepare IRS tax paperwork (Form 433-A) for review by your tax-resolution firm", so the data-sharing screen matches the consent text.
3. **Truv Dashboard.**
   - Development → Web Hooks: register `https://resspark.zh-a16.workers.dev/api/webhooks/truv` for Sandbox, subscribed to `task-status-updated` and `order-status-updated`.
   - Orders settings: set order expiry to at least 14 days (the default is 72 h).
   - Optional: create a template "ResSpark payroll" (income; payroll + docs data sources) and put its id in `TRUV_TEMPLATE_ID` in `app/wrangler.jsonc`, then redeploy.
4. **Sandbox demo logins.**
   - Plaid: `user_good` / `pass_good`.
   - Truv: `goodlogin` / `goodpassword`, or `multiple.employments` / `goodpassword` for several employers.

## Workers plan notes

- The Cloudflare account is on **Workers Paid** as of 2026-10-10 (verified via the subscriptions API, CONTEXT D-06 update).
- Limits that apply: 30 s CPU per invocation, 1,000 subrequests per invocation.
- Queues and cron are available. Plan 03 created `resspark-jobs` and its dead-letter queue `resspark-jobs-dlq`, with the `JOBS` producer and consumer bound to `resspark`, and a `*/15 * * * *` cron trigger. Plan 04-02 set the consumer to `max_retries: 5` / `retry_delay: 60`, added a consumer on `resspark-jobs-dlq`, and added the daily `0 3 * * *` trigger (`worker/src/cron.ts`).
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
