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
- **smoke:connect** — `pnpm -C app run smoke:connect https://resspark.zh-a16.workers.dev`: the Phase 4 acceptance run. It is `--auth --connect-flow`: the client flow plus item views, consent, both start routes (503 `provider_not_configured` without keys, 200 with keys), `/c/return` (302 and CSP), and the staff connections list. It ends `ok connect-flow complete (keys: payroll yes|no, bank yes|no)`. See `docs/app/scripts/smoke-connect.md`.
- **smoke:esign** — `pnpm -C app run smoke:esign https://resspark.zh-a16.workers.dev`: the Phase 6 acceptance run. It is `--auth --esign-flow`: the client flow plus the address step (Smarty suggest or the manual fallback), the staff review's address and signature, the ESIGN consent, the signing start (503 without DocuSeal keys or a mapped template, 200 with), the `/c/sign/<item>` CSP, and the `?step=` signing link. It ends `ok esign-flow complete (keys: smarty yes|no, docuseal yes|no)`. See `docs/app/scripts/smoke-esign.md`.
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
| `EMAIL` | `send_email` binding in `wrangler.jsonc` (Cloudflare Email Service; no key) | built in to Workers Paid |
| `EMAIL_FROM` | `wrangler.jsonc` var (not a secret), `notifications@resspark.com` | must be on a domain onboarded in Cloudflare Email Service; until resspark.com is onboarded, email reports `not_configured` |
| `LOGICS_MODE` | `wrangler.jsonc` var (not a secret) | `fake` for the demo; `live` after Test connection succeeds (see § Logics mode) |
| `TOKEN_ENC_KEY_1` | Worker secret + `app/.dev.vars` (required) | `pnpm -C app secrets:provision` (Phase 4, D-15). It seals Plaid access tokens in `connection_secrets` and is kept if it already exists, because rotating it orphans every stored token. |
| `PLAID_CLIENT_ID`, `PLAID_SECRET` | optional Worker secrets + `app/.dev.vars` | `pnpm -C app secrets:provider plaid`, entered at the prompt (echo off). Without them, bank `/start` returns `provider_not_configured` and the portal offers manual upload only. |
| `TRUV_CLIENT_ID`, `TRUV_SECRET` | optional Worker secrets + `app/.dev.vars` | `pnpm -C app secrets:provider truv`, entered at the prompt. `TRUV_SECRET` is also the webhook signing key. Without them, payroll `/start` returns `provider_not_configured`. |
| `PLAID_ENV`, `TRUV_TEMPLATE_ID`, `PLAID_REMOVE_AFTER_DAYS`, `BANK_PROVIDER` | `wrangler.jsonc` vars (not secrets) | `production` (since 2026-10-11, user decision), `""`, `30`, `plaid` (Phase 4, D-15) |
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

Runs end to end in fixture mode (`LOGICS_MODE=fake`), with no Logics credentials and no email sending domain. The fixture cases use `example.com` emails and `555-010-xxxx` phones.

1. Open https://resspark.zh-a16.workers.dev/admin and sign in as the demo admin.
2. Click `Find a client` and type `(555) 010-0001`. Two cards appear, because the spouses on the fixture share that phone.
3. Confirm Jordan Rivera. The request builder opens.
4. In the builder, switch one item off and rename another, then click `Create request`.
5. On the request page, type the email with a typo (for example `jordan.rivera@gmial.com`) and accept the suggested fix.
6. Click `Send link`, then `Copy link`.
7. Open the copied link in a phone-sized private window. The client sees the firm, the agent, and one `Start` button.
8. Tap `Start`. The step list appears, with a status chip on each step.
9. Tap `View` on a step. The `Coming next` sheet opens; close it.
10. Back in admin, click `Email link`. It shows `Email not configured` until Cloudflare Email Service has a sending domain (`EMAIL_FROM`).
11. Tick the SMS consent checkbox.
12. Click `Revoke link`, then refresh the phone window. The client now sees the ask-your-agent page ("This link isn't active").

The same path, minus the clicks, is checked by `pnpm -C app run smoke:auth https://resspark.zh-a16.workers.dev --client-flow`. It uses fixture case 900003 and deletes its probe request afterwards.

## USER ACTION REQUIRED (Phase 2)

Phase 2 works in fixture mode today. These items need the user (or Andrew at ValorTax) before it runs against real data:

1. **Logics credentials.** Paste a Logics API key and secret token in Settings → Integrations and click Test connection; it must succeed. Then set `"LOGICS_MODE": "live"` in `app/wrangler.jsonc` and redeploy (see § Logics mode).
2. **Email (Cloudflare Email Service).** Add the firm's domain to Cloudflare, onboard it under Compute → Email Service → Email Sending, then set `EMAIL_FROM` in `app/wrangler.jsonc` to an address on it and redeploy. No API key is needed. Until then every email reports `not_configured` and staff copy links instead.
3. **Questions for Andrew.** Which permission scopes the Logics API key should carry; the `FileCategoryID` to use for uploaded documents; and the `ActivityType` for the case notes ResSpark will write.
4. **Two open `shortcut:` questions in the Logics client.**
   - What `CaseInfo` returns for an unknown case id (`app/worker/src/integrations/logics/client.ts`). The code currently treats the undocumented answer as "not found".
   - Which phone format the `phone` lookup header accepts (`app/worker/src/integrations/logics/lookup.ts`). The code currently retries in the documented format.

## Demo script (Phase 4)

Use Sandbox vendor keys and synthetic fixture cases only. Never point the demo at a production Plaid or Truv environment or at real client data before Phase 8. `PLAID_ENV` is `production` in `app/wrangler.jsonc` since 2026-10-11 (user decision: only Production Plaid keys are on hand), so the bank step uses real bank logins and real data, not `user_good` / `pass_good`. The Truv environment is set by which Access Secret is installed.

With keys (see § USER ACTION REQUIRED (Phase 4)):

1. Open https://resspark.zh-a16.workers.dev/admin and sign in as the demo admin.
2. Open an existing request built from the `Standard resolution packet`, or create one with steps 2-6 of § Demo script (Phase 2). Copy the client link.
3. Open the link in a phone-sized private window and tap `Start`.
4. Tap `View` on `Connect your payroll`, then `Connect payroll`, then `I agree`.
5. In Truv Bridge, search for an employer and sign in with `multiple.employments` / `goodpassword`. Wait for `COMPLETED`. The sheet lists two employers.
6. In admin, open the request page. The `Payroll` card reads `Done` and links the pay stubs and W-2s. The same files appear under the item in the review panel.
7. On the phone, tap `View` on `Connect your bank`, then `Connect bank`, then `I agree`.
8. Hosted Link opens. Pick First Platypus Bank, sign in with `user_good` / `pass_good`, and enter code `1234`.
9. The phone returns to the portal and shows `Checking your connection…`, then the step list.
10. In admin, the `Bank` card first reads `Syncing (bank is sending history)`. Within a few minutes it reads `Done`, the statement grid shows `Statement` cells for First Platypus Bank, and the transactions table fills in.
11. Click `Refresh` on the card. It re-reads the bank and shows the same result.

Without keys, the same request still demos. With `TRUV_CLIENT_ID` unset, the payroll sheet leads with `Upload pay stubs instead`. With the Plaid keys unset, the bank sheet leads with its upload fallback. Uploaded files land in the review panel as in Phase 3.

The no-click version is `pnpm -C app run smoke:connect https://resspark.zh-a16.workers.dev`. Its last line records the mode it ran in.

Runbooks:

- [Truv webhook endpoint health and re-enable](runbooks/truv-webhook-endpoint.md)
- [Plaid and Truv sandbox rehearsal checklist](runbooks/plaid-sandbox-rehearsal.md). Run it once before the demo.

## USER ACTION REQUIRED (Phase 4)

Phase 4 deploys and runs without any vendor key: payroll and bank steps show the manual-upload fallback. To turn on the live connections (Sandbox keys are the demo path):

1. **Keys.** Run `pnpm -C app secrets:provider plaid` and paste the Plaid Sandbox Client ID and Secret (Plaid Dashboard → Developers → Keys). Run `pnpm -C app secrets:provider truv` and paste the Truv Sandbox Client ID and Access Secret (Truv Dashboard → Development → Keys). The prompts do not echo. Values go only to the Worker and the git-ignored `app/.dev.vars`. Leave a prompt empty to skip that key.
2. **Plaid Dashboard.**
   - Developers → API → Allowed redirect URIs: add `https://resspark.zh-a16.workers.dev/c/return`.
   - Link → Link customization: create a Sandbox customization whose use case reads "Prepare IRS tax paperwork (Form 433-A) for review by your tax-resolution firm", so the data-sharing screen matches the consent text.
   - Statements product access: on the first real bank connection, check that the statement grid shows `Statement` cells and not `Not supported` for First Platypus Bank. Plaid teams created in 2023 or earlier must request Statements access first (RESEARCH Open Question 5).
3. **Truv Dashboard.**
   - Development → Web Hooks: register `https://resspark.zh-a16.workers.dev/api/webhooks/truv` for Sandbox, subscribed to `task-status-updated` and `order-status-updated`.
   - Orders settings: set order expiry to at least 14 days (the default is 72 h).
   - Optional: create a template "ResSpark payroll" (income; payroll + docs data sources) and put its id in `TRUV_TEMPLATE_ID` in `app/wrangler.jsonc`, then redeploy.
4. **Sandbox demo logins.**
   - Plaid: `user_good` / `pass_good`, with 2FA code `1234`.
   - Truv: `goodlogin` / `goodpassword`, or `multiple.employments` / `goodpassword` for several employers.
5. **Check the secrets.** `pnpm -C app wrangler secret list` prints names only. It must list the Phase 4 names `TOKEN_ENC_KEY_1`, `PLAID_CLIENT_ID`, `PLAID_SECRET`, `TRUV_CLIENT_ID` and `TRUV_SECRET`, next to the Phase 1 names. As of 2026-10-11 only `TOKEN_ENC_KEY_1` is set, so the Worker runs in no-keys mode.
6. **Rehearse.** Run [the sandbox rehearsal checklist](runbooks/plaid-sandbox-rehearsal.md) and fill in its Observed and Pass columns. It records the one real Plaid-signed `SESSION_FINISHED` webhook that the fixtures cannot produce.
7. **Sandbox only until Phase 8.** Do not install Plaid Production or Truv Production keys before the Phase 8 go-live review.

If payroll connections stop advancing, see [Truv webhook endpoint](runbooks/truv-webhook-endpoint.md).

## Demo script (Phase 6)

Use DocuSeal **Test Mode**, the synthetic `Engagement letter (demo)` template, a public test address, and Logics in fake mode (D-21). DocuSeal never emails or texts anyone: every submission sends `send_email` and `send_sms` false, and the send-copy button is off.

With keys (see § USER ACTION REQUIRED (Phase 6)):

1. Open https://resspark.zh-a16.workers.dev/admin and sign in as the demo admin.
2. Open a request built from the `Standard resolution packet`, or create one with steps 2-6 of § Demo script (Phase 2). Copy the client link into a phone-sized private window.
3. Tap `Start`.
4. Address: tap `Confirm your address`, type `1600 Amphitheatre Pkwy`, pick the suggestion, then tap `Yes, that's my address`.
5. In admin, the address card shows the county, the 5-digit FIPS, the RDI (`Residential` or `Commercial`), and `USPS verified`. The client was never asked for a county.
6. Back on the phone: tap `Sign` on `Engagement letter`, then `I agree`. The signature field is the next thing on screen (3 taps from a fresh link; 2 from the card's `Copy signing link`).
7. The embed shows DocuSeal's **"Developer Sandbox. Upgrade to start using in Production."** banner in Test Mode. Do not tap it; it goes away with a production key (RESEARCH Pitfall 10).
8. Type a name in the signature field and finish. The phone returns to the step list.
9. In admin, the signature card shows `Signed` and the `Test` badge, and the item lists two PDFs (signed document and audit trail), each with a sha256.
10. Approve the item, then `Push to Logics (simulated)`. In fake mode the push completes with a fake Logics document id.

Without keys, both steps still demo honestly and are presented as "coming next" (D-21). With no Smarty keys the address step opens the manual form at once and saves the address unverified (`Unverified — county unknown` on the staff card). With no DocuSeal key, or with the template not mapped, the signing page reads `Your agent will send this form another way.` and the staff card shows `E-sign not set up`.

The no-click version is `pnpm -C app run smoke:esign https://resspark.zh-a16.workers.dev`. Its last line records the key mode.

Runbooks:

- [DocuSeal Test Mode setup](runbooks/docuseal-test-mode.md): account, key, webhook, HMAC, template, notifications, the Test Mode webhook question, production switch.
- [E-sign and address real-device check](runbooks/esign-phone-check.md). Run it once on a real iPhone and a real Android phone before the demo.

## USER ACTION REQUIRED (Phase 6)

Phase 6 deploys and runs without any vendor key: the address step uses the manual form and the signing step shows its not-set-up state. To turn both on:

1. **DocuSeal (Zack).** Full steps in [docuseal-test-mode.md](runbooks/docuseal-test-mode.md).
   1. Create a docuseal.com account (US cloud) and switch the Console to **Test Mode**.
   2. Create a test API key and enter it with `pnpm -C app secrets:provider docuseal` (`DOCUSEAL_API_KEY`).
   3. While in Test Mode, add a webhook at `https://resspark.zh-a16.workers.dev/api/webhooks/docuseal` for `form.viewed`, `form.started`, `form.completed`, and `form.declined`.
   4. Turn on Security → HMAC and enter that secret with the same command (`DOCUSEAL_WEBHOOK_SECRET`).
   5. Build `Engagement letter (demo)` with one signer role and the fields `Full name`, `Case ID`, `Address` (optional), `Signature`, and `Date`.
   6. In ResSpark, map it under **Settings → Integrations → E-sign templates** and click `Save templates`.
   7. Turn off DocuSeal's account-level signer notification emails (Settings → Notifications). ResSpark already sends `send_email: false`, but account settings may still email signers (RESEARCH A7).
   8. Optional: set `DOCUSEAL_CONTRACT_TEMPLATE_ID` (the template's numeric id) next to the key in `app/.dev.vars` and run `pnpm -C app test:live:file worker/test/docuseal-contract.test.ts` to check the live API contract.
2. **Smarty (Zack).** Create a smarty.com account (free trial), generate a **secret** key pair with US Autocomplete Pro and US Street access, and enter it with `pnpm -C app secrets:provider smarty` (`SMARTY_AUTH_ID`, `SMARTY_AUTH_TOKEN`).
3. **Re-run the smoke.** `pnpm -C app run smoke:esign https://resspark.zh-a16.workers.dev` must end `ok esign-flow complete (keys: smarty yes, docuseal yes)`. If code changed since the last deploy, deploy first with `pnpm -C app run deploy`.
4. **ValorTax counsel (via Andrew).**
   - Which forms may be e-signed: the engagement or fee agreement, Form 2848, Form 8821. **Form 433-A stays out of the portal**; it is never offered for e-signing.
   - Review the ESIGN consent text (`esign-v1`, in `app/src/lib/consent-text.ts`) and any state disclosure rules for tax-resolution contracts.
   - Confirm ValorTax submits e-signed 2848 and 8821 forms **online** (IRS.gov/Submit2848, IRS.gov/Submit8821, one form per submission) and how it **authenticates the client's identity** for a remote signature, as the IRS requires.
   - Form 2848 also needs the **representative's Part II** declaration and signature. A one-role template captures only the taxpayer, so for now the representative signs Part II outside the portal (RESEARCH Open Question 6).
5. **Andrew.**
   - Upload the real ValorTax engagement letter and the official 2848 and 8821 PDFs as DocuSeal templates once counsel approves, and map them in Settings.
   - Accept DocuSeal production pricing (per completed document, on top of a Pro seat) before switching off Test Mode.
   - Optional: share an Anvil developer key if a hands-on Anvil comparison is still wanted (D-09; the written evaluation is in the 06-08 SUMMARY).
6. **Real-device check.** Run [esign-phone-check.md](runbooks/esign-phone-check.md) on a real iPhone (Safari) and a real Android phone (Chrome): at most 3 taps from a fresh link and 2 from a copied signing link to the signature field, no zoom when the typed-signature input is focused, no sideways scroll, and `Signed` with both PDFs on the staff card within seconds. Also note whether Test Mode fired the webhooks (`webhook_events` rows with `provider 'docuseal'`; RESEARCH A2).

## Workers plan notes

- The Cloudflare account is on **Workers Paid** as of 2026-10-10 (verified via the subscriptions API, CONTEXT D-06 update).
- Limits that apply: 30 s CPU per invocation, 1,000 subrequests per invocation.
- Queues and cron are available. Plan 03 created `resspark-jobs` and its dead-letter queue `resspark-jobs-dlq`, with the `JOBS` producer and consumer bound to `resspark`, and a `*/15 * * * *` cron trigger. Plan 04-02 set the consumer to `max_retries: 5` / `retry_delay: 60`, added a consumer on `resspark-jobs-dlq`, and added the daily `0 3 * * *` trigger (`worker/src/cron.ts`).
- Email goes through Cloudflare Email Service (the `EMAIL` `send_email` binding; 3,000 emails a month included, then $0.35 per 1,000). It needs a sending domain on Cloudflare DNS, which the account does not have yet, so `EMAIL_FROM` is empty. Resend was used until 2026-10-11 and has been removed.
- Platform invocation logs are off (`observability.logs.invocation_logs: false`) so URLs carrying client-link tokens are never logged; the Worker's allowlisted logger is the only log sink.

## Checks

- `pnpm check` runs `pnpm -C app check`, which starts with `node scripts/check-file-sizes.mjs`, then `python ../src/tools/export_golden_fixtures.py --check` (fails when `app/worker/test/fixtures/engine/golden.json` is stale against the Python oracle; needs Python 3.11 on PATH), and continues with `tsc -b`, `eslint .`, and `pnpm test`.
- `pnpm hygiene` runs `bash app/scripts/hygiene-check.sh` — the PLAT-06 gate (ignore rules, no tracked build output, one lockfile, engines, size gate, 500/501 boundary self-test, no `sb_secret_` in the client bundle).
- `app/scripts/check-file-sizes.mjs` fails on any code file over 500 lines. It excludes only `src/components/ui/**` (vendored shadcn), `routeTree.gen.ts`, and `worker-configuration.d.ts`; the limit itself is a CLAUDE.md rule, not a setting.

## Question contract

`question_definitions` has 28 rows = `src/questions.py` (28 ids, byte-identical; `questions:reconcile` reports an empty diff, Plan 04). CLAUDE.md and PROJECT.md say "32 questions"; that number is stale. Open question for the user: should CLAUDE.md/PROJECT.md be corrected to 28, or are 4 questions missing from `src/questions.py`? Nothing was inserted or removed in Phase 1.

## Spikes

The Phase 1 day-one spike results (a)–(f) — Vitest Workers plugin, JWT verification, signed Storage upload without a session, email provider, Truv sandbox order, Logics questions for Andrew — are in [`.planning/phases/01-foundation-staff-sign-in/01-SPIKES.md`](../../.planning/phases/01-foundation-staff-sign-in/01-SPIKES.md).
