# Phase 1: Foundation & Staff Sign-In - Research

**Researched:** 2026-10-10
**Domain:** React/Vite/shadcn SPA + Hono on Cloudflare Workers (static assets, Queue, cron) + Supabase (Auth, Postgres/RLS, migrations) + HMAC link/cookie primitives + repo hygiene
**Confidence:** HIGH on the live environment facts (probed this session), HIGH on Cloudflare/Supabase/Hono mechanics (official docs via Context7 + direct fetch), MEDIUM on the two items that still need a spike (Vitest 5 + Workers plugin at runtime; Rate Limiting binding on the Free plan).

Provenance legend: `[VERIFIED: …]` tool-confirmed from an authoritative source or a live probe this session; `[CITED: …]` official docs read this session; `[ASSUMED]` training knowledge, not verified.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

Discussion ran in `--auto` mode (non-interactive session). Each decision below is the recommended option, chosen on the strength of `.planning/research/SUMMARY.md`, the codebase maps, and what Andrew asked for on the call. Review and override any of them in this file before planning if they look wrong.

#### Repo layout and toolchain
- **D-01:** The new app lives in a new top-level `app/` directory as ONE Vite project: `app/src/` (SPA) and `app/worker/` (Hono API, queue consumer, cron), built with `@cloudflare/vite-plugin` and deployed by `wrangler` as one Worker with static assets. The old `src/frontend/` is frozen (no new work, tests left as-is) and is deleted in Phase 7 when the intake screens are rebuilt. Python `src/*.py` stays untouched. — **Reversibility:** costly — paths are referenced by `wrangler.jsonc`, `docs/`, CI, and the companion-doc convention; moving later means touching all of them.
- **D-02:** Package manager is pnpm (10.32 is installed; shadcn-admin ships a pnpm lockfile). A root `pnpm-workspace.yaml` lists `app` only. `src/frontend/package-lock.json` stays as legacy until that folder is deleted; a note in `src/frontend/README.md` marks it legacy. The PLAT-06 "one lockfile" check applies to `app/`. Node engines `>=22.12` in `app/package.json`.
- **D-03:** Fork `satnaing/shadcn-admin` by copying its `src/components`, `src/features` (only the layout, sidebar, header, command palette, data-table, and auth screens), `src/styles`, `components.json`, and config files into `app/`. Strip Clerk, axios, faker, the demo pages (tasks, apps, chats, users). Keep TanStack Router 1.168, TanStack Query 5.99, TanStack Table 8.21 (pin, do not take v9), Zod 4, Tailwind 4, TypeScript `~6.0.3` (not 7). Every copied file keeps the MIT attribution in `app/LICENSES.md`.
- **D-04:** Two route trees in one router: `/admin/*` (staff, sidebar layout, auth-gated) and `/c/$token` (client, minimal centered mobile layout, no sidebar, no analytics). Code-split so the `/c/*` bundle does not pull in the admin shell. Phase 1 ships the admin shell with an empty dashboard and a placeholder `/c/$token` page that only performs the token-to-cookie exchange and shows "Your agent will send you a link" when the token is invalid.
- **D-05:** Repo hygiene lands first, in its own plan: fix the merged `.envnode_modules/` line in `.gitignore` into `.env`, `.env.*` (except `.env.example`), `node_modules/`, and `dist/`; `git rm -r --cached src/frontend/dist`; add `app/scripts/check-file-sizes.mjs` (fails on any code file over 500 lines, excluding generated files) wired into `pnpm check`.

#### Hosting and deploy
- **D-06:** Worker name `resspark`, deployed to the free `*.workers.dev` subdomain for the demo (custom domain is a later polish item). `wrangler.jsonc` sets `assets.not_found_handling: "single-page-application"` and `run_worker_first: ["/api/*", "/webhooks/*"]`, `compatibility_flags: ["nodejs_compat"]`, one cron trigger `*/15 * * * *`, and (if the account is on Workers Paid) a queue `resspark-jobs` with a dead-letter queue `resspark-jobs-dlq`. If queue creation fails because the account is on the Free plan, deploy without the queue, process webhooks inline plus cron reconcile, and surface "upgrade to Workers Paid ($5/mo)" as a blocker note in the plan summary. — **Reversibility:** reversible — adding the queue later is a config change plus one consumer file.
- **D-07:** Secrets live only as Worker secrets set with `wrangler secret put` (SUPABASE_URL, SUPABASE_SECRET_KEY, CLIENT_LINK_HMAC_KEY, LOGICS_* placeholders, later provider keys). Local dev reads them from `app/.dev.vars` (git-ignored). The SPA receives only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (the existing values in `src/frontend/.env` are reused by copying that file to `app/.env`; never print them). Use `sb_publishable_` / `sb_secret_` keys, not legacy anon/service_role.
- **D-08:** The Bash secret guard blocks reading `.env`; run wrangler and the Supabase CLI through `npx -y dotenv-cli -- <cmd>` from the repo root so the token stays in the child process, and run `supabase db query --linked --project-ref zvkphuikjpwoauqdimcf` from a directory without the root `.env` (the CLI fails to parse it). Record both in `docs/app/README.md`.

#### Data: Supabase project, migrations, RLS
- **D-09:** Use the existing Supabase project `zvkphuikjpwoauqdimcf` ("ResSpark"). The 15 baseline tables from `src/schemas/database_schema.sql` are already applied with IRS standards seeded; migrations are additive only. — **Reversibility:** one-way — the standards data (16,115 housing rows) and the existing table names are the engine's contract; dropping or renaming them breaks `src/standards_repository.py` and Phase 7.
- **D-10:** Migrations are plain SQL files in `supabase/migrations/NNNN_<name>.sql`, applied in order by `app/scripts/db-migrate.mjs`, which runs each pending file through `supabase db query --linked -f` and records it in a new `app_migrations (name, applied_at)` table. Reason: `supabase db push` needs the database password, which is not available; the Management API path works with the CLI's stored login. — **Reversibility:** reversible — switching to `supabase db push` later only needs the password and a one-time backfill of `supabase_migrations.schema_migrations`.
- **D-11:** Phase 1 migration `0002_platform_foundation.sql` adds: `firms` (one row seeded: ValorTax, with `settings jsonb` for Logics config placeholders), `staff_profiles` (`user_id` → `auth.users`, `firm_id`, `role` in staff|admin, `display_name`), `events` (`id`, `firm_id`, `case_id` nullable, `request_id` nullable, `actor_type` in staff|client|system|provider, `actor_id` text, `action` text, `payload jsonb`, `created_at`), `client_links` (`id`, `firm_id`, `request_id` nullable for now, `version` int, `expires_at`, `revoked_at`, `opened_at`, `created_by`), and adds `firm_id`, `logics_case_id`, `retention_until` to the existing `cases` table (nullable, additive). Later phases add `requests`, `request_items`, `connections`, `connection_secrets`, `webhook_events`, `logics_pushes`, `consents` in their own migrations. The `log_event(...)` plpgsql function inserts an `events` row; mutations that must be atomic with their event call RPCs (introduced per phase).
- **D-12:** RLS is enabled on every public table (the 15 baseline tables plus the new ones) with default grants to `anon` and `authenticated` revoked and NO policies for those roles in v1. The Worker is the only data path, using the secret key. The PLAT-02 proof is a Vitest integration test (`app/worker/test/rls.test.ts`) that calls PostgREST with the publishable key for every public table and asserts 0 rows or 401, run against the live project with env vars. pgTAP is not used (needs local Docker). — **Reversibility:** reversible — adding staff `SELECT` policies for direct reads or Realtime later is additive.
- **D-13:** Reconcile the question contract in Phase 1: a script diffs `src/questions.py` (32) against `question_definitions` (28 rows) and inserts the missing rows additively so the database matches the code's 32-question contract. Output the diff in the plan summary; do not change `src/questions.py`.

#### Staff authentication and the data path
- **D-14:** Staff sign in with Supabase Auth email + password. Public sign-up is disabled; staff accounts are created by `app/scripts/create-staff.mjs` (admin API with the secret key) which also writes `staff_profiles` and sets `app_metadata.firm_id` and `app_metadata.role` (never `user_metadata`). Magic link and MFA are not in Phase 1 (MFA is Phase 8). For the demo, seed two users: one for Zack and one labeled "Andrew (case manager)". — **Reversibility:** reversible.
- **D-15:** The SPA uses `supabase-js` for the auth session only (sign in, refresh, sign out) and sends the access token as `Authorization: Bearer` to the Worker. The Worker verifies the JWT (spike: `@supabase/server` Hono adapter first; fallback `jose` with the project JWKS) and loads `staff_profiles` to get `firm_id`. Every `/api/admin/*` route requires a verified staff user; every data query is scoped by that `firm_id` in one data-access module (`app/worker/src/db/`). The SPA never calls PostgREST for data in v1. — **Reversibility:** reversible.
- **D-16:** Route guard: TanStack Router `beforeLoad` on the `/admin` layout redirects to `/admin/sign-in` when there is no session; the Worker returns 401 JSON for API calls without a valid token. Sign-in and sign-out each call `/api/admin/session` so the Worker writes `events` rows (`staff.signed_in`, `staff.signed_out`) with actor id and timestamp (PLAT-04 proof).

#### Client-link token and cookie primitives (used by Phase 2 screens)
- **D-17:** Token format is `base64url(link_id || HMAC-SHA256(CLIENT_LINK_HMAC_KEY, link_id || version))`, verified against the `client_links` row (`expires_at`, `revoked_at`, `version`). Staff can re-copy a link because the token is re-derived, not stored. Default expiry 14 days; revoke sets `revoked_at`; regenerate bumps `version`. — **Reversibility:** costly — links already sent to clients embed the format; changing it invalidates them (mitigated by `version` and re-sending).
- **D-18:** `GET /c/:token` is served by the Worker (not the SPA) and only exchanges a valid token for an HttpOnly, Secure, SameSite=Lax cookie `rs_client` (a signed session value holding `link_id`, 24-hour lifetime), then redirects to `/c/` with no token in the URL. The page sends `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, and `X-Robots-Tag: noindex`. A GET never marks the link opened; Phase 2's Start tap does. Token guessing is rate-limited per IP with the Workers Rate Limiting binding (fallback: an in-memory sliding window per isolate plus a 404 for all failures).

#### Demo safety and logging
- **D-19:** Worker vars: `APP_ENV` (`sandbox` or `production`), `LOGICS_WRITE_ENABLED` (default `false`), `LOGICS_TEST_CASE_IDS` (comma list). The SPA fetches `/api/config` and shows a persistent SANDBOX banner whenever `APP_ENV !== "production"`. A `logicsWriteGuard(caseId)` function in `app/worker/src/integrations/logics/` throws unless the flag is true and the id is allowlisted; Phase 1 ships the guard with a unit test even though no Logics write exists yet.
- **D-20:** One structured JSON logger with an explicit field allowlist: `request_id`, `route`, `method`, `status`, `duration_ms`, `firm_id`, `actor_id`, `error_code`. Never bodies, headers, query strings, tokens, or `/c/<token>` paths (logged as `/c/[redacted]`). A unit test asserts a failing request with a token in the URL logs no token (PLAT-08 proof).

#### Tests and the day-one spikes
- **D-21:** Vitest 5 with `projects` (`web` with jsdom, `worker` with `@cloudflare/vitest-plugin` 1.4.0). Spike first; if the Workers plugin does not work with Vitest 5 within 30 minutes, test Worker handlers with Hono's `app.request()` under plain Vitest and pin the plugin later. Playwright is added in Phase 3 when there are client flows to drive.
- **D-22:** Spikes to run in Phase 1 (each a short plan task with a written result in the plan summary, not production code): (a) Vitest 5 with the Workers plugin; (b) `@supabase/server` Hono adapter on `wrangler dev`; (c) a signed Supabase Storage upload (TUS) from an unauthenticated browser page, to de-risk Phase 3; (d) Cloudflare Email Service availability on this account versus Resend (no key exists for either; the result decides what Phase 2 can promise for REQ-04); (e) Truv sandbox `multiple.employments` order creation, only if Truv credentials are in the Worker secrets, otherwise record "blocked: no Truv keys"; (f) Logics scopes, `FileCategoryID`, and `ActivityType` values: this is a question for Andrew, recorded as an open item, not a code task.

### Claude's Discretion
- Exact shadcn component set, folder names under `app/src/features/`, Tailwind theme tokens (light default, dark toggle kept from shadcn-admin), icon set (Lucide), and the empty-dashboard copy.
- Hono middleware ordering, error envelope shape (`{ error: { code, message } }` is the suggestion), and request-id generation.
- Whether `app_migrations` tracking is a table or a comment convention, as long as `db-migrate.mjs` is idempotent.

### Deferred Ideas (OUT OF SCOPE)
- Supabase Realtime for dashboard updates (v2; polling in v1).
- PostHog analytics on staff pages only (v2; never on `/c/*`).
- Custom domain for the Worker (post-demo polish).
- Staff MFA and the WISP evidence pack (Phase 8).
- Direct PostgREST reads from the SPA with staff policies (only if the Worker-only path becomes a bottleneck).
- Virus scanning service for uploads (v2).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PLAT-01 | Deployed to a public Workers URL serving the SPA plus `/api/*` and `/webhooks/*` from one deploy | Q2 (Vite plugin + `wrangler.jsonc` + `run_worker_first`), Code Examples 1–3, Environment Availability (account is on Workers **Free**: see Verified Facts F-1) |
| PLAT-02 | RLS on every table, deny-by-default grants, automated anon-zero-rows test | Verified Facts F-4/F-5 (baseline already RLS-on with zero anon grants; default ACL still grants new tables), Q4 (revoke + default privileges + PostgREST probe semantics), Code Example 6 (`rls.test.ts`) |
| PLAT-03 | Browser holds no secret, never writes Postgres; credentials are Worker secrets | Q3 (`sb_publishable_` only in the SPA; `sb_secret_` as a Worker secret), `secrets.required` wrangler key, `.dev.vars` rules |
| PLAT-04 | Every action writes an `events` row with actor, timestamp, case/request id | Q4 migration shape (`events` + `log_event()`), D-16 session endpoints, Code Example 8 (session route) |
| PLAT-05 | `LOGICS_WRITE_ENABLED` flag, code-enforced CaseID allowlist, SANDBOX banner | Q2 `vars`, Code Example 9 (`logicsWriteGuard` + test), `/api/config` |
| PLAT-06 | `.gitignore` covers all `.env`, `dist/` untracked, Node `>=22.12`, one package manager/lockfile | Verified Facts F-8/F-9 (actual `.gitignore` bytes; `src/frontend/dist` is already untracked), Q10 (`engine-strict` proven by probe), Code Example 11 (`check-file-sizes.mjs`) |
| PLAT-07 | Staff sign in with Supabase Auth, stay signed in across refresh; `/admin/*` and data unreachable unauthenticated | Q3 (JWKS ES256 confirmed live, `jose` verify), Q1 (`beforeLoad` guard in `routes/admin/route.tsx`), Code Examples 4–5 |
| PLAT-08 | Logs never contain tokens, document bytes, or PII | Q5/Q2 (`observability.logs.invocation_logs: false` because Workers invocation logs record the request URL), Code Example 10 (allowlist logger using `routePath(c)`), test |
</phase_requirements>

## Summary

Phase 1 is mostly wiring of well-documented pieces, and this session verified the two things that could have derailed the plan: the live Supabase project already signs JWTs with an **ES256 asymmetric key** (so `jose` + the project JWKS verifies staff tokens locally in the Worker, no shared secret), and the 15 baseline tables already have **RLS enabled with zero grants to `anon`/`authenticated` and zero policies**. The remaining risk on the data side is that Postgres default privileges in `public` still grant `anon`/`authenticated` full access to any **new** table, so migration `0002` must revoke on the new tables and `ALTER DEFAULT PRIVILEGES` once; the PostgREST probe then returns **401** for `anon` (`42501 → 401 if the role is anonymous, else 403`) rather than an empty array, and the test must accept either.

Three facts change the locked decisions' *execution*, not the decisions themselves. (1) The Cloudflare account has **no paid subscription** (`/accounts/{id}/subscriptions` → `[]`), i.e. Workers **Free**: Queues do exist on Free (10,000 ops/day, 24 h retention), cron triggers work, but CPU is 10 ms/invocation and Email Sending is Paid-only, so D-06's "upgrade to Workers Paid ($5/mo)" note is a real blocker to surface, and spike (d) resolves to "Resend over `fetch`" without running. (2) `@supabase/server`'s framework **adapters are deprecated and will be removed on 2026-12-01** per its own docs, so D-15's spike (b) resolves by research: go straight to the documented fallback (`jose.createRemoteJWKSet` + `jwtVerify`, ~30 lines) instead of spending the 30 minutes. (3) `src/questions.py` declares **28** questions, not 32, and its ids are byte-identical to the 28 `question_definitions` rows, so D-13's reconciliation script will produce an empty diff; the "32" in CLAUDE.md/PROJECT.md is stale and the plan should record that instead of inserting rows.

Repo hygiene is smaller than D-05 assumes: `src/frontend/dist/` is **not** tracked (0 files in `git ls-files`; `src/frontend/.gitignore` already ignores it), and the root `.gitignore` is four CRLF lines (`venv/`, `__pycache__/`, `node_modules/`, `.env` with no trailing newline) rather than a merged line; it is missing `.env.*`, `dist/`, `.dev.vars*`, and `.wrangler/`. `pnpm 10.32.1` honours `.npmrc engine-strict=true` (proven with a fake `engines.node >=99`).

**Primary recommendation:** Build `app/` as one Vite project with `[react(), tanstackRouter(), tailwindcss(), cloudflare()]`, a `wrangler.jsonc` with `not_found_handling: "single-page-application"`, `run_worker_first: ["/api/*", "/webhooks/*", "/c/*"]`, `observability.logs.invocation_logs: false`, and `secrets.required`; verify staff JWTs with `jose` against `https://zvkphuikjpwoauqdimcf.supabase.co/auth/v1/.well-known/jwks.json`; ship migration `0002` with explicit `REVOKE` + `ALTER DEFAULT PRIVILEGES`; and raise the Workers Paid upgrade as the first user-facing checkpoint.

## Verified Environment Facts (live probes, 2026-10-10)

These were observed with read-only commands this session. Cite them in plans instead of re-probing.

| # | Fact | Evidence |
|---|------|----------|
| F-1 | Cloudflare account `a16da3bffdeb782c36d0e28382a9b25b` ("Zh@licom.ai's Account") has **no subscriptions** → Workers Free plan | `GET /client/v4/accounts/{id}/subscriptions` → `{"success":true,"result":[]}` via `npx -y dotenv-cli -- sh -c 'curl …'` `[VERIFIED: Cloudflare API probe]` |
| F-2 | No Queues exist yet on the account; `wrangler queues list` runs without error | `npx -y dotenv-cli -- npx wrangler queues list` → empty table `[VERIFIED: wrangler 4.149.0]` |
| F-3 | Supabase project `zvkphuikjpwoauqdimcf` publishes **one ES256 (P-256) signing key**; asymmetric JWT signing is on | `GET https://zvkphuikjpwoauqdimcf.supabase.co/auth/v1/.well-known/jwks.json` → 200, `[{"kid":"f755e0d7-…","alg":"ES256","kty":"EC","crv":"P-256","key_ops":["verify"]}]` `[VERIFIED: live probe]` |
| F-4 | All 15 public tables have `rowsecurity = true`; **0 policies** in `public` | `pg_tables` / `pg_policies` via `supabase db query --linked` `[VERIFIED: live probe]` |
| F-5 | `anon` and `authenticated` hold **no** table grants in `public`; `service_role` holds full grants (e.g. `cases`, `question_definitions`) | `information_schema.role_table_grants` `[VERIFIED: live probe]` |
| F-6 | **Default ACL still grants new tables to `anon`/`authenticated`**: `pg_default_acl` for role `postgres` in `public` is `{postgres=arwdDxtm,anon=arwdDxtm,authenticated=arwdDxtm,service_role=arwdDxtm}` for tables, sequences, and functions (`anon=X`, `authenticated=X`) | `[VERIFIED: live probe]` — this is why `0002` must revoke and alter default privileges |
| F-7 | `question_definitions` has 28 rows; `auth.users` 0; `storage.buckets` 0; `housing_utilities_standards` 16,115 rows; `supabase_migrations.schema_migrations` has 2 versions (`20260927140207`, `20260927141549`); Postgres 17.6 | `[VERIFIED: live probe]` |
| F-8 | `src/questions.py` has **28** `{"id": …}` entries; `comm` against the 28 seed ids in `database_schema.sql` shows **no difference either way** | `grep -o '"id": *"…"' src/questions.py \| sort` vs seed ids `[VERIFIED: local diff]` |
| F-9 | Root `.gitignore` bytes: `venv/^M$`, `__pycache__/^M$`, `node_modules/^M$`, `.env` (no newline). `src/frontend/dist/` is **not tracked** (`git ls-files src/frontend/dist` → 0; `src/frontend/.gitignore:2:dist/` ignores it) | `cat -A .gitignore`, `git ls-files`, `git check-ignore -v` `[VERIFIED: local]` |
| F-10 | `supabase db query --linked --project-ref zvkphuikjpwoauqdimcf -f file.sql -o json` works from a directory with no `supabase/` folder and no `.env`, using the CLI's stored login ("Initialising login role…"); multi-statement files run | `[VERIFIED: supabase CLI 2.120.0 probe]` |
| F-11 | pnpm 10.32.1 enforces `engines.node` when `.npmrc` has `engine-strict=true` ("Expected version: >=99.0.0 Got: v24.14.0 … engines.node field specified") | scratchpad probe `[VERIFIED: local]` |
| F-12 | Toolchain: Node v24.14.0, pnpm 10.32.1, wrangler 4.149.0 (authenticated), Supabase CLI 2.120.0 (logged in; `ResSpark` project listed, `linked: false`), git 2.52 | `[VERIFIED: local]` |
| F-13 | `satnaing/shadcn-admin` main is at commit `e16c87f…`; `src/components/ui/sidebar.tsx` is **728 lines** (fails a naive 500-line check); 30 files in `src/components/ui` | GitHub API + raw fetch `[VERIFIED: GitHub]` |

## Project Constraints (from CLAUDE.md)

- Front end is TypeScript (root `CLAUDE.md` "Use type script for all front end").
- Cloudflare access via `CLOUDFLARE_API_TOKEN` in `.env`; use `npx wrangler` or the API; **never print the token** (hence `npx -y dotenv-cli -- …`, D-08).
- Every new code file gets a companion Markdown file under `docs/` mirroring the source path; no code file over 500 lines (split first); modular code; Ponytail (smallest complete change, `shortcut:` comments for known limits).
- Keep intake/`FinancialData`/determination/standards separation; `case_financial_data` is canonical; NULL ≠ 0; standards stay in SQL; do not change IRS thresholds or the 32-question contract (note: the contract is actually 28 ids, see F-8 — do **not** change `questions.py`).
- Prefer standard-library Python; keep `unittest`; tests must not need a live database (applies to `src/tests`; the Phase 1 `rls.test.ts` is a Worker test that intentionally hits the live project and is gated by env vars).
- Supabase work follows `.agents/skills/supabase/SKILL.md`: authorization data in `app_metadata` never `user_metadata`; never ship the secret key to a client; RLS on every exposed table; views with `security_invoker`; pin versions and commit lockfiles; `supabase db query` needs CLI ≥ 2.79 (we have 2.120).
- Open-source first: search for high-star repos before building (done: shadcn-admin 15.7k, Hono 32.5k, supabase/server 94; all MIT). Copy code only from MIT sources; ERPNext/Bigcapital/DocuSeal are visual references.
- Use the `supabase` skill when working with Supabase; `Context/` and `Examples/` are read-only.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Serve SPA shell (`/admin/*`, `/c/`) | CDN / Static (Workers static assets) | — | Hashed assets served without invoking the Worker; `not_found_handling: single-page-application` serves `index.html` for client routes |
| `/c/:token` exchange → cookie → redirect | API / Backend (Worker) | — | Token must never reach SPA code or logs; Worker-first route (`run_worker_first`) |
| Staff sign-in UI, session persistence | Browser / Client (supabase-js, localStorage) | API (verifies JWT) | Supabase Auth issues the session; the Worker only verifies and never stores it |
| Staff JWT verification, `firm_id` scoping | API / Backend | Database (`staff_profiles`) | JWKS verification is stateless; `firm_id` comes from `app_metadata` claim and is cross-checked against `staff_profiles` |
| Event log writes (`staff.signed_in`, …) | API / Backend → Database (`log_event()` RPC) | — | Only the Worker holds the secret key; atomic with the mutation when applicable |
| RLS + grants + migrations | Database / Storage | Build tooling (`db-migrate.mjs` via Management API) | Deny-by-default is a database property; the Worker bypasses RLS by design via `service_role` |
| Demo safety (`LOGICS_WRITE_ENABLED`, allowlist) | API / Backend (`logicsWriteGuard`) | Browser (SANDBOX banner is display only) | Enforcement must be server-side; the banner is UX |
| Allowlisted JSON logging | API / Backend | Platform (Workers Logs, invocation logs **off**) | Our logger controls fields; the platform's invocation log would otherwise record `/c/<token>` URLs |
| Rate limiting of token guesses | API / Backend (Rate Limiting binding) | — | Per-location counters are adequate abuse control |
| Queue consumer + cron | API / Backend (same Worker, `queue`/`scheduled` exports) | — | One deploy per D-01/D-06 |

## Standard Stack

Versions below were re-read from the npm registry this session unless marked; the full table in `.planning/research/STACK.md` (2026-10-10) still holds.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@cloudflare/vite-plugin` | 1.63.1 (peers `vite ^6.1 \|\| ^7 \|\| ^8`, `wrangler ^4.149.0`) `[VERIFIED: npm registry]` | Run the Worker inside Vite dev, build SPA + Worker, emit output `wrangler.json` | Official React + Vite guide pattern `[CITED: developers.cloudflare.com/workers/framework-guides/web-apps/react]` |
| `wrangler` | 4.149.0 `[VERIFIED: npm registry]` | dev/deploy/secrets/`types` | Peer of the plugin |
| `hono` | 4.13.13 `[VERIFIED: npm registry]` | Worker router, cookie helper, `secureHeaders`, `requestId`, `routePath`, `app.request()` | Workers-native, typed bindings `[CITED: hono.dev]` |
| `jose` | 6.2.12 `[VERIFIED: npm registry]` | `createRemoteJWKSet` + `jwtVerify` for Supabase ES256 tokens | The exact snippet Supabase documents `[CITED: supabase.com/docs/guides/auth/jwts]` |
| `@supabase/supabase-js` | 2.117.3 `[VERIFIED: npm registry]` | SPA auth session; Worker data client (secret key, `persistSession:false`) and `auth.admin.createUser` | Official |
| `@tanstack/react-router` / `@tanstack/router-plugin` | 1.170.42 / 1.168.43 `[VERIFIED: npm registry]` | File-based routing, `beforeLoad` guard, `autoCodeSplitting` | What shadcn-admin ships `[VERIFIED: shadcn-admin package.json]` |
| `vitest` | 5.0.3 `[VERIFIED: npm registry]` | `projects` (`web` jsdom, `worker` Workers plugin) | Already 5.0.2 in the repo |
| `@cloudflare/vitest-plugin` | 1.4.0, peer `vitest ^4.1.0 \|\| ^5.0.0` `[VERIFIED: npm registry]` | Run Worker tests in workerd with bindings | Replaces `vitest-pool-workers` |
| `dotenv-cli` | 11.0.0 `[VERIFIED: npm registry]` | Inject `.env` into child processes without printing (D-08) | Used today via `npx -y` |
| React 19.3, Vite 8.3.4, `@vitejs/plugin-react` 6.1.2, Tailwind 4.3.3, TS `~6.0.3`, TanStack Query 5.104, Table 8.21.3, Zod 4.6.5, RHF 7.89, lucide, sonner, cmdk, zustand | per STACK.md (2026-10-10) `[VERIFIED: STACK.md npm reads]` | SPA | shadcn-admin's stack |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@supabase/server` | 1.9.1 (deps `jose ^6.2.0`, `@supabase/middleware ^1.0.0`; peers `hono ^4`, `@supabase/supabase-js ^2`) `[VERIFIED: npm registry]` | **Not recommended for Phase 1**: `docs/adapters/hono.md` says "Adapters are deprecated and will be removed on December 1, 2026" `[VERIFIED: raw.githubusercontent.com/supabase/server/main/docs/adapters/hono.md]`; the replacement is a `toHono([withRequiredClaims(), withSupabaseClient()])` bridge over `@supabase/middleware` (`examples/frameworks/hono/supabase-middleware.ts`, ~90 lines you must copy) | Only if you want its `withSupabaseClient` RLS-scoped client later; Phase 1 needs neither |
| `@hono/standard-validator` | 0.4.0 `[VERIFIED: npm registry]` | Zod request validation | Phase 2+ (no bodies to validate in Phase 1 beyond `/api/admin/session`) |
| `msw` | 3.0.3 `[VERIFIED: npm registry]` | Mock outbound calls in Worker tests | Phase 2+ |
| `knip` | 6.41.0 `[VERIFIED: npm registry]` | Find dead code after stripping Clerk/faker/demo pages | Optional, one run after the fork |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `jose` JWKS verification | `@supabase/server` Hono adapter | Deprecated (removal 2026-12-01); the bridge needs a copied 90-line shim and `@supabase/middleware`; `jose` is 30 lines and already a transitive dep |
| `jose` | Hono `jwk({ jwks_uri })` middleware | Also fine; `jose` keeps the claim checks (`iss`, `aud`, `exp`) explicit and testable without Hono |
| Workers Rate Limiting binding | In-memory sliding window per isolate | Binding is per-location anyway; in-memory is the D-18 fallback and testable under plain Vitest |
| `app_migrations` table | Inserting into `supabase_migrations.schema_migrations` | The CLI owns that table (2 rows exist, F-7); writing to it risks confusing a later `supabase db push`; keep ours separate (Claude's discretion → table) |
| Cloudflare Email Service | Resend over `fetch` | Email Sending is Beta and "Available on Workers Paid plan" `[CITED: developers.cloudflare.com/email-service]`; account is Free (F-1) |

**Installation (inside `app/`, after copying shadcn-admin files and its `pnpm-lock.yaml` is discarded):**
```bash
pnpm add hono@4.13.13 jose@6.2.12 @supabase/supabase-js@2.117.3
pnpm add -D @cloudflare/vite-plugin@1.63.1 wrangler@4.149.0 vitest@5.0.3 @cloudflare/vitest-plugin@1.4.0 jsdom@30.1.2 dotenv-cli@11.0.0
pnpm remove @clerk/react axios @faker-js/faker react-top-loading-bar @vitest/browser-playwright @vitest/coverage-v8 @vitest/ui vitest-browser-react playwright
npx wrangler types   # emits worker-configuration.d.ts (Env + runtime types); no @cloudflare/workers-types needed
```

## Package Legitimacy Audit

Seam run: `gsd_run query package-legitimacy check --ecosystem npm …` (2026-10-10). The seam flags `too-new` on any package whose **latest release** is days old; for the packages below that signal reflects release cadence (weekly downloads are in the millions and every repo is the canonical org), not package age. Per protocol they are kept with the SUS tag; the planner may satisfy the checkpoint with one `pnpm view <pkg> repository.url time.created` glance.

| Package | Registry | Latest publish | Downloads/wk | Source Repo | Verdict | Disposition |
|---------|----------|----------------|--------------|-------------|---------|-------------|
| `hono` | npm | 2026-10-04 | 74.1M | github.com/honojs/hono | SUS (too-new) | Keep — `[WARNING: flagged as suspicious — verify before using.]` |
| `jose` | npm | 2026-09-05 | 153M | github.com/panva/jose | OK | Approved |
| `@supabase/supabase-js` | npm | 2026-10-07 | 30.6M | github.com/supabase/supabase-js | SUS (too-new) | Keep — `[WARNING: flagged as suspicious — verify before using.]` |
| `@cloudflare/vite-plugin` | npm | 2026-10-08 | 5.6M | github.com/cloudflare/workers-sdk | SUS (too-new) | Keep — `[WARNING: …]` |
| `@cloudflare/vitest-plugin` | npm | 2026-10-08 | 665k | github.com/cloudflare/workers-sdk | SUS (too-new) | Keep — `[WARNING: …]` |
| `vitest` | npm | 2026-09-30 | 124M | github.com/vitest-dev/vitest | SUS (too-new) | Keep — `[WARNING: …]` |
| `@tanstack/react-router` / `router-plugin` | npm | 2026-10-10 | 19M / 15.9M | github.com/TanStack/router | SUS (too-new) | Keep — `[WARNING: …]` |
| `zod` | npm | 2026-09-13 | 334M | github.com/colinhacks/zod | SUS (too-new) | Keep — `[WARNING: …]` |
| `wrangler` | npm | 2026-10-08 | 26.4M | github.com/cloudflare/workers-sdk | SUS (too-new) | Keep — `[WARNING: …]` |
| `dotenv-cli` | npm | 2025-10-28 | 7.3M | github.com/entropitor/dotenv-cli | OK | Approved |
| `@supabase/server` | npm | 2026-10-05 | 173k | github.com/supabase/server | SUS (too-new) | Not installed in Phase 1 (adapter deprecated) |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** hono, @supabase/supabase-js, @cloudflare/vite-plugin, @cloudflare/vitest-plugin, vitest, @tanstack/react-router, @tanstack/router-plugin, zod, wrangler — all on the `too-new` (latest-release recency) signal only; planner inserts one `checkpoint:human-verify` before the first `pnpm install` covering the set.

No `postinstall` scripts were observed in the seam signals for these packages `[VERIFIED: seam signals]`.

## Answers to the Planner's Ten Questions

### Q1. shadcn-admin fork mechanics

Repo state at `main` = `e16c87f` `[VERIFIED: GitHub trees API]`. Layout that matters:

```
components.json           # style new-york, baseColor slate, css src/styles/index.css, aliases @/components @/lib/utils @/components/ui @/lib @/hooks, iconLibrary lucide
vite.config.ts            # tanstackRouter({ target:'react', autoCodeSplitting:true }), react(), tailwindcss(); alias '@' -> ./src; Vitest browser-mode test block (drop)
tsconfig.json             # references tsconfig.app.json + tsconfig.node.json; paths "@/*": ["./src/*"]
tsconfig.app.json         # ES2020, Bundler resolution, strict, noUnused*, include ["src"]
eslint.config.js          # flat config, ignores ['dist','src/components/ui'], no-console: error, consistent-type-imports
src/main.tsx              # QueryClient + createRouter({ routeTree, context:{queryClient} }); imports AxiosError (strip)
src/routeTree.gen.ts      # generated by @tanstack/router-plugin; never hand-edit (exclude from the 500-line check)
src/routes/__root.tsx     # createRootRouteWithContext<{queryClient}>; Toaster; devtools in dev
src/routes/_authenticated/route.tsx     # pathless layout -> AuthenticatedLayout (sidebar)
src/routes/(auth)/sign-in.tsx           # route group; validateSearch z.object({ redirect })
src/routes/clerk/**                     # DELETE (ClerkProvider lives only here)
src/components/{layout,data-table,ui}/  # keep; layout/data/sidebar-data.ts imports ClerkLogo (edit)
src/features/{auth,dashboard,errors,settings}  # keep auth/sign-in, errors, settings/appearance; dashboard -> empty
src/features/{apps,chats,tasks,users}   # DELETE (demo pages; tasks/data/tasks.ts and users/data/users.ts import @faker-js/faker)
src/stores/auth-store.ts  # zustand store writing a fake token to a cookie -> replace with supabase-js session
src/lib/handle-server-error.ts, src/main.tsx  # the only AxiosError references -> fetch + typed error envelope
src/assets/clerk-logo.tsx, clerk-full-logo.tsx # DELETE
```
`[VERIFIED: raw.githubusercontent.com/satnaing/shadcn-admin/main/*]` for every file named above.

Files referencing **Clerk**: `src/routes/clerk/**`, `src/assets/clerk-*.tsx`, `src/components/layout/data/sidebar-data.ts` (`ClerkLogo` import), `.env.example` (`VITE_CLERK_PUBLISHABLE_KEY=`). **axios**: `src/main.tsx`, `src/lib/handle-server-error.ts`. **faker**: `src/features/users/data/users.ts`, `src/features/tasks/data/tasks.ts` (both deleted with their features). `package.json` dev scripts use Vitest browser mode (`--browser.headless`) with `@vitest/browser-playwright`; replace with `vitest run`.

**Second root layout without the sidebar (D-04):** TanStack file routes nest only under directories/pathless prefixes you create. A plain `src/routes/c/$token.tsx` and `src/routes/c/index.tsx` have **no** `_authenticated` ancestor, so they render inside `__root.tsx` only (`Outlet` + `Toaster`) — no sidebar, no `SearchProvider`. Put the admin tree under `src/routes/admin/route.tsx` (a `route.tsx` in a directory is that path's layout route, exactly how shadcn-admin's `settings/route.tsx` works) with the `beforeLoad` guard, and move the sign-in page to `src/routes/admin/sign-in.tsx` *outside* the guarded layout (use a pathless `src/routes/admin/_shell/route.tsx` for the guarded sidebar part, or keep `admin/route.tsx` unguarded and guard `admin/_shell`). Keep `autoCodeSplitting: true`; it code-splits per route file so `/c/*` never imports `app-sidebar.tsx` as long as `c/*.tsx` files do not import from `@/components/layout` `[CITED: TanStack router docs, routing-concepts + auth-and-guards skill]`.

Guard pattern (from the TanStack docs, adapted to supabase-js):
```tsx
// src/routes/admin/_shell/route.tsx
export const Route = createFileRoute('/admin/_shell')({
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getSession()           // reads localStorage; server still enforces
    if (!data.session) throw redirect({ to: '/admin/sign-in', search: { redirect: location.href } })
  },
  component: AuthenticatedLayout,
})
```
`[CITED: tanstack.com/router auth-and-guards: throw redirect({ to, search:{ redirect: location.href } })]`

Route-group folders `(auth)`/`(errors)` keep URLs flat; `$token` is a dynamic segment (`Route.useParams()`), and `__root.tsx` keeps `notFoundComponent`/`errorComponent` `[VERIFIED: shadcn-admin source + TanStack docs]`.

### Q2. `@cloudflare/vite-plugin` + Hono + static assets

```ts
// app/vite.config.ts
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

export default defineConfig({
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss(), cloudflare()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
})
```
`[CITED: developers.cloudflare.com/workers/framework-guides/web-apps/react — "plugins: [react(), cloudflare()]" after the framework plugin]`

```jsonc
// app/wrangler.jsonc  (input config; vite build writes the output wrangler.json)
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "resspark",
  "main": "./worker/src/index.ts",
  "compatibility_date": "2026-10-10",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*", "/webhooks/*", "/c/*"]
    // "directory" is intentionally omitted: the Vite plugin populates it with the client build
  },
  "vars": { "APP_ENV": "sandbox", "LOGICS_WRITE_ENABLED": "false", "LOGICS_TEST_CASE_IDS": "" },
  "secrets": { "required": ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "CLIENT_LINK_HMAC_KEY"] },
  "triggers": { "crons": ["*/15 * * * *"] },
  "queues": {
    "producers": [{ "queue": "resspark-jobs", "binding": "JOBS" }],
    "consumers": [{ "queue": "resspark-jobs", "max_batch_size": 1, "max_retries": 8,
                    "dead_letter_queue": "resspark-jobs-dlq", "max_concurrency": 3 }]
  },
  "ratelimits": [{ "name": "LINK_RATE_LIMITER", "namespace_id": "1001", "simple": { "limit": 20, "period": 60 } }],
  "observability": { "enabled": true, "logs": { "invocation_logs": false } }
}
```
Key facts: `assets.directory` "is not used when configuring assets with Vite… will automatically point to the client build output"; `not_found_handling: "single-page-application"` serves `index.html` for unknown paths; `run_worker_first` is an array of path globs (negations like `"!/assets/*"` allowed) `[CITED: developers.cloudflare.com/workers/llms-full.txt React SPA tutorial + examples/spa-shell]`. `/c/*` is added to `run_worker_first` because D-18 requires the Worker (not the asset layer) to answer `GET /c/:token`; `/c/` (no token) can still fall through to `env.ASSETS.fetch()` from the Worker. `secrets.required` validates names at dev/deploy time and drives `wrangler types` `[CITED: developers.cloudflare.com/workers/wrangler/configuration]`. `observability.logs.invocation_logs = false` disables the platform invocation log, which otherwise records "the request method and the request URL" `[CITED: developers.cloudflare.com/workers/observability/logs/workers-logs]` — required for PLAT-08 since `/c/<token>` is a URL. Rate-limit `period` must be `10` or `60`; `namespace_id` is a string holding an integer; two bindings sharing a `namespace_id` share counters `[CITED: developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit]`.

**Dev / build / deploy:** `pnpm dev` = `vite` runs the SPA and the Worker (in workerd) on one origin (default port 5173; cron can be fired with `curl "http://localhost:5173/cdn-cgi/local/scheduled?cron=*/15+*+*+*+*"`) `[CITED: cron-triggers page]`. `pnpm build` = `tsc -b && vite build` emits `dist/client` plus the Worker bundle and an **output** `wrangler.json`, and writes `.wrangler/deploy/config.json` (`{"configPath": "../../dist/…/wrangler.json"}`) so a bare `npx wrangler deploy` "will automatically use the output wrangler.json that was included in the build output" `[CITED: React guide + wrangler/configuration]`. Scripts: `"deploy": "vite build && wrangler deploy"`, `"cf-typegen": "wrangler types"` `[CITED: Cloudflare demos]`. Add `.wrangler/`, `.dev.vars*`, `.env*` to `.gitignore` `[CITED: React guide step 4]`.

**Worker entry shape** (one default export, three handlers):
```ts
export default {
  fetch: app.fetch,
  queue: async (batch: MessageBatch, env: Env, ctx: ExecutionContext) => { /* Phase 4 */ },
  scheduled: async (controller: ScheduledController, env: Env, ctx: ExecutionContext) => { /* Phase 2+ */ },
} satisfies ExportedHandler<Env>
```
`[CITED: hono.dev/docs/getting-started/cloudflare-workers — export default { fetch: app.fetch, scheduled }]`

**Queues on Free:** "Available on Free and Paid plans"; Free = "10,000 operations/day included", retention "24 hours (non-configurable)"; Paid = 1M ops/month then $0.40/M `[CITED: developers.cloudflare.com/queues + queues/platform/pricing]`. One older tutorial still says "You need a Workers Paid plan to enable Queues" `[CITED: queues/tutorials/handle-rate-limits — stale]`. Expected failure mode if a dashboard enable step is still required: `wrangler queues create` / `wrangler deploy` returns a 10xxx API error naming the plan; D-06's fallback (deploy without the `queues` block) applies. **The real Free-plan blocker is CPU: 10 ms per invocation and 50 subrequests** vs Paid "max of 5 minutes… default 30 seconds" for "$5 USD per month" `[CITED: workers/platform/pricing; limits snippet "subrequests defaults to 50 for free and 10,000 for paid"]`. JWT verification + Supabase round-trips fit in 10 ms CPU in most cases (I/O wait is not CPU), but Phase 3+ PDF work will not. Surface the upgrade as a checkpoint now.

### Q3. Supabase Auth on Workers

**Verify the access token with `jose` (recommended, replaces spike b):**
```ts
// app/worker/src/auth/staff-jwt.ts
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined   // module-scope cache is safe: public keys only
export async function verifyStaffJwt(token: string, supabaseUrl: string) {
  const issuer = `${supabaseUrl}/auth/v1`
  jwks ??= createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`))
  const { payload } = await jwtVerify(token, jwks, { issuer, audience: 'authenticated' })
  return payload as JWTPayload & { sub: string; role: string; app_metadata?: { firm_id?: string; role?: string } }
}
```
Supabase documents exactly `createRemoteJWKSet(new URL('https://project-id.supabase.co/auth/v1/.well-known/jwks.json'))` + `jwtVerify(jwt, JWKS, { issuer })`; the JWKS endpoint "does not return any keys if you are not using asymmetric JWT signing keys" and is edge-cached 10 minutes `[CITED: supabase.com/docs/guides/auth/jwts]`. This project returns an ES256 key (F-3), so HS256/legacy-secret handling is unnecessary. Claims available: `iss, aud, exp, iat, sub, role, aal, session_id, email, app_metadata, user_metadata` `[CITED: supabase.com/docs/guides/auth/jwt-fields]`. Authorization data must come from `app_metadata` (user-editable `user_metadata` is unsafe) `[CITED: .agents/skills/supabase/SKILL.md]`.

`@supabase/server` status: adapters deprecated (removal 2026-12-01); its env resolution derives the JWKS URL from `SUPABASE_URL` and requires `nodejs_compat` or an `env` override object to read `process.env` on Workers; `withRequiredClaims()` answers 401 without a token; `withPostgresClient` "Needs raw TCP… not Workers-style isolates" `[VERIFIED: supabase/server docs/environment-variables.md, docs/adapters/hono.md, docs/api-reference.md]`. Not needed in Phase 1.

**Admin user creation (`create-staff.mjs`, run locally with `npx -y dotenv-cli -- node app/scripts/create-staff.mjs`):**
```js
const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
const { data, error } = await admin.auth.admin.createUser({
  email, password, email_confirm: true,
  app_metadata: { firm_id, role: 'admin' },        // never user_metadata
})
// then: insert staff_profiles { user_id: data.user.id, firm_id, role, display_name } via admin.from('staff_profiles')
```
`[CITED: supabase docs — auth.admin.createUser with email/password/email_confirm/app_metadata examples]`. Secret keys (`sb_secret_…`) "provide full access to your project's data, bypassing Row Level Security", run as `service_role` (`BYPASSRLS`), are sent on the `apikey` header (supabase-js does this when you pass the key), and are created under **Settings > API Keys**; `anon`/`service_role` JWT keys are deprecated "by the end of 2026" but stay valid until disabled `[CITED: supabase.com/docs/guides/api/api-keys]`.

**Disable public sign-up:** Management API `PATCH /v1/projects/{ref}/config/auth` body `{ "disable_signup": true }` (also `external_email_enabled`, `mailer_autoconfirm`, `jwt_exp` ≤ 604800, `site_url`) `[VERIFIED: api.supabase.com/api/v1-json OpenAPI, 235 auth-config properties]`. Without a scoped PAT in the environment, the two no-secret paths are: (a) dashboard **Authentication → Sign In / Providers → "Allow new users to sign up" off** `[ASSUMED: dashboard label]`; (b) `supabase init` + `supabase link --project-ref zvkphuikjpwoauqdimcf` (password optional) + `[auth] enable_signup = false` in `supabase/config.toml` + `supabase config push --project-ref …` which "Pushes the properties your local config.toml declares to the linked project… Properties the file does not declare are left unchanged" `[VERIFIED: supabase config push --help; CITED: config.toml spec auth.enable_signup]`. Recommend (b): it is reviewable in git and `supabase config diff` previews it. `signInWithPassword` still works with sign-ups disabled `[ASSUMED]`.

**SPA session:** `createClient(VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY)` persists the session in `localStorage` by default (`persistSession: true`, `autoRefreshToken: true`) → survives refresh (PLAT-07); use `getSession()` to read the access token for the `Authorization: Bearer` header and `getClaims()` (local WebCrypto verification against the cached JWKS when asymmetric keys are in use) to decide whether a user is signed in; `getSession()`'s embedded user "shouldn't be trusted on its own" for authorization `[CITED: supabase docs auth_methods partial + client options]`.

### Q4. Migrations via Management API, grants, PostgREST probe

`supabase db query --linked --project-ref <ref> -f <file>` resolves SQL from `--file` > positional > stdin and dispatches to the Management API `POST /v1/projects/{ref}/database/query` with the CLI's bearer token; no DB password `[VERIFIED: supabase/cli query.command.ts + query.handler.ts]`. The endpoint body is `{ query: string (minLength 1), parameters?: unknown[], read_only?: boolean }` `[VERIFIED: OpenAPI]`. Server side (pg-meta) prefixes `SET statement_timeout='…s'; SET idle_session_timeout='…s';` and runs the whole string through one node-postgres `pool.query(sql)` call `[VERIFIED: supabase/postgres-meta src/server/routes/query.ts + src/lib/db.ts]`. Consequences: multi-statement files work (F-10 ran a 9-statement file); the string is one simple-protocol query, so statements run in one implicit transaction unless the file contains its own `BEGIN`/`COMMIT` `[ASSUMED: PostgreSQL simple-query protocol semantics]`; wrap each migration in explicit `BEGIN; … COMMIT;` anyway so intent is unambiguous; no documented payload size limit `[ASSUMED]` — keep files small (the seed data already lives in the project).

`db-migrate.mjs` (idempotent): `CREATE TABLE IF NOT EXISTS public.app_migrations (name text primary key, applied_at timestamptz not null default now())` (then immediately `REVOKE ALL ON public.app_migrations FROM anon, authenticated`), list `supabase/migrations/*.sql` sorted, query applied names, for each pending file run `supabase db query --linked --project-ref … -f <abs path>` with `cwd` set to a directory **without** `.env` (D-08) and then `INSERT INTO app_migrations (name) VALUES ($1)`; spawn via `child_process.spawnSync('npx', ['-y','supabase', …], { stdio: 'inherit' })`.

**Grants block for `0002` (run once; also re-run after any future `CREATE TABLE`):**
```sql
-- existing 15 tables already have RLS on and no anon/authenticated grants (verified 2026-10-10); make it explicit and durable
ALTER TABLE public.firms, public.staff_profiles, public.events, public.client_links, public.app_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
```
Rationale: F-6 shows default ACLs for `postgres` **and** `supabase_admin` grant `anon`/`authenticated` on new tables/sequences/functions; the `supabase_admin` default ACL cannot be altered from the `postgres` role (`[ASSUMED]` — tables created through the Management API are owned by `postgres` per F-5 owners, so the `postgres` default ACL is the one that applies). The `log_event()` function must therefore also be `REVOKE EXECUTE … FROM anon, authenticated, public` and `SECURITY INVOKER` (the Worker calls it as `service_role`) `[CITED: supabase skill — SECURITY DEFINER in public is callable by all roles]`.

**PostgREST probe semantics:** `GET https://<ref>.supabase.co/rest/v1/<table>?select=*&limit=1` with header `apikey: <sb_publishable_…>` and no `Authorization` runs as `anon`. With no grant, Postgres raises `42501` and PostgREST maps it to "if authenticated 403, else 401" `[VERIFIED: PostgREST/postgrest-docs errors.rst table row 42501]`. A missing `apikey` header is a different 401 (`"No API key found in request"`, observed live) — the test must send the key so it exercises grants, not key validation. With RLS on but a grant present, the response is `200 []`. The test asserts `status === 401 || (status === 200 && body.length === 0)` and iterates the table list from `pg_tables` (hard-code the 15 + 4 names; the Worker has no `pg_tables` access through PostgREST).

**D-13 outcome:** `questions.py` ids = seed ids (28 = 28, F-8). The reconciliation script should print the diff (empty) and exit 0 without inserting; record "contract is 28 ids; CLAUDE.md/PROJECT.md '32' is stale" in the plan summary. Do not edit `questions.py` (locked).

### Q5. HMAC token + cookie + rate limit + headers

Web Crypto on Workers: `crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign','verify'])`, `crypto.subtle.sign('HMAC', key, data)`, and `crypto.subtle.verify('HMAC', key, mac, data)` which "guards against timing attacks"; random bytes via `crypto.getRandomValues(new Uint8Array(16))`; `crypto.subtle.timingSafeEqual(a, b)` exists for equal-length buffers `[CITED: developers.cloudflare.com/workers/examples/signing-requests + workers-best-practices]`. Token (D-17): `link_id` = 16 random bytes; `mac` = HMAC(key, `link_id || uint32be(version)`) (32 bytes); token = base64url(`link_id || mac`) = 64 chars. Verify: decode → split → look up `client_links` by `link_id` (`service_role`) → recompute with the row's `version` → `crypto.subtle.verify` → check `revoked_at is null and expires_at > now()`; every failure path returns the same 404 HTML. Base64url: `Buffer.from(bytes).toString('base64url')` under `nodejs_compat` `[CITED: signing-requests example imports node:buffer]`.

Cookie (D-18) with Hono: `setSignedCookie(c, 'rs_client', JSON.stringify({ link_id, exp }), env.CLIENT_LINK_HMAC_KEY, { path: '/', httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 86400 })`; read with `getSignedCookie(c, secret, 'rs_client')`; `prefix: 'host'` is available if a `__Host-` name is wanted `[CITED: hono.dev/docs/helpers/cookie]`. Hono signed cookies use HMAC-SHA256 over the value `[ASSUMED]`; use a separate derived secret (`CLIENT_LINK_HMAC_KEY + ':cookie'` hashed) so the cookie MAC and the link MAC keys differ `[ASSUMED: good practice]`.

Headers: `secureHeaders()` sets `Referrer-Policy: no-referrer` by default (table row `referrerPolicy | Referrer-Policy | no-referrer | True`) plus `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, etc.; it has **no** `X-Robots-Tag` or `Cache-Control` option, so set those with `c.header('X-Robots-Tag', 'noindex')` and `c.header('Cache-Control', 'no-store')` in a tiny `/c/*` middleware `[CITED: hono.dev/docs/middleware/builtin/secure-headers]`. Keep `secureHeaders` scoped to `/c/*` and `/api/*` (the SPA's third-party scripts come in Phase 4 and will need a CSP then).

Rate Limiting binding: config above; `const { success } = await env.LINK_RATE_LIMITER.limit({ key: ip })` → 429 on failure; counters are "local to the Cloudflare location" `[CITED: rate-limit docs]`. Plan availability is not stated on the page `[ASSUMED: works on Free]`; D-18's in-memory fallback covers it if deploy rejects the binding. Client IP: `c.req.header('cf-connecting-ip')` `[ASSUMED: standard Cloudflare header]`.

### Q6. Vitest 5 + `@cloudflare/vitest-plugin` 1.4.0

Peer range `vitest ^4.1.0 || ^5.0.0` `[VERIFIED: npm registry]`; no Vitest-5-specific issue found by search (search surfaced only the old pool-package threads) — the runtime spike (a) stays. Config:
```ts
// app/vitest.config.ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    projects: [
      { extends: true, test: { name: 'web', environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'] } },
      './worker/vitest.config.ts',
    ],
  },
})
// app/worker/vitest.config.ts
import { defineProject } from 'vitest/config'
import { cloudflareTest } from '@cloudflare/vitest-plugin'
export default defineProject({
  plugins: [cloudflareTest({ wrangler: { configPath: '../wrangler.jsonc' } })],
  test: { name: 'worker', include: ['test/**/*.test.ts'] },
})
```
Rules: inline projects inherit root plugins; file-referenced projects do not (so the Workers plugin lives only in the worker project); the Workers pool "rejects `environment` values other than `node` (including `jsdom`)", so jsdom must be a separate project without `cloudflareTest`; tests import `{ env, SELF, fetchMock } from 'cloudflare:test'`; test tsconfig `types: ["@cloudflare/vitest-plugin/types", "@types/node", "vite/client"]`; run one with `vitest --project worker` `[VERIFIED: cloudflare/workers-sdk fixtures/vitest-plugin-examples; CITED: vitest.dev/guide/projects]`.

Fallback (D-21): `await app.request('/api/admin/session', { method: 'POST', headers }, MOCK_ENV)` where the third argument populates `c.env` `[CITED: hono.dev/docs/guides/testing]`. The pure functions (`logicsWriteGuard`, logger allowlist, token encode/verify) need no Workers runtime and belong in the `web`/node project regardless.

### Q7. Cloudflare Email Service vs Resend

Email Sending is "Beta for outbound transactional emails" and "Available on Workers Paid plan"; binding `"send_email": [{ "name": "EMAIL", "remote": true }]`; `await env.EMAIL.send({ to, from, subject, html, text })` returns a `messageId`; onboarding requires a Cloudflare-DNS domain with SPF/DKIM/DMARC and a `cf-bounce` MX; `wrangler dev` uses the remote binding `[CITED: developers.cloudflare.com/email-service, /get-started/send-emails]`. The account is Free (F-1) and no ValorTax domain is on Cloudflare DNS → spike (d) result: **blocked on plan + domain; use Resend**. Resend: `POST https://api.resend.com/emails`, `Authorization: Bearer re_…`, JSON `{ from, to, subject, html|text }` → `{ "id": "…" }`; Free plan 3,000 emails/month, 100/day, 3 domains `[CITED: resend.com/docs/api-reference/emails/send-email, resend.com/pricing]`. What Phase 2 needs from Phase 1: a `RESEND_API_KEY` entry in `secrets.required` (empty until the user creates a key), a `MAIL_FROM` var, and the `events` table for `link.sent` rows — nothing else.

### Q8. Signed Supabase Storage upload (TUS) from an unauthenticated browser

Worker (secret key): `const { data: { token, path } } = await admin.storage.from(bucket).createSignedUploadUrl(objectPath)`. Browser, simple path (≤ 6 MB): `supabase.storage.from(bucket).uploadToSignedUrl(path, token, file)` with a publishable-key client and no session. Browser, resumable path: `tus-js-client` with `endpoint: 'https://<ref>.storage.supabase.co/storage/v1/upload/resumable/sign'` (note `/sign`), `headers: { apikey: PUBLISHABLE_KEY, 'x-signature': token }`, `uploadDataDuringCreation: true`, `chunkSize: 6 * 1024 * 1024` ("must be set to 6MB (for now) do not change it"), `metadata: { bucketName, objectName, contentType, cacheControl }`, `removeFingerprintOnSuccess: true` `[CITED: supabase.com/docs/guides/storage/uploads/resumable-uploads; VERIFIED: supabase/supabase examples/storage/resumable-upload-signed-uppy/index.html uses endpoint …/upload/resumable/sign + x-signature]`. Spike (c) steps: create a private bucket `spike` (0 buckets exist, F-7) with a 25 MB limit; a 20-line node script mints the token; a static HTML page (no Supabase session) uploads a 10 MB file with tus-js-client; verify the object via the admin client; delete the bucket. Record pass/fail and the exact endpoint that worked.

### Q9. Truv sandbox order creation

"The base URL https://prod.truv.com/v1/ is the same in each environment"; the environment is selected by the access-key prefix (sandbox/dev/prod) `[CITED: docs.truv.com/developers/testing/test-credentials]`. `POST https://prod.truv.com/v1/orders/` with headers `X-Access-Client-Id`, `X-Access-Secret`; required body `products` (e.g. `["income","employment"]`), `first_name`, `last_name`; optional `email`, `phone` (E.164-normalized), `order_number` (≤512 chars), `employers[]` (≤5), `notification_settings.suppress_user_notifications`; 201 → `{ id, bridge_token, share_url, employers[], … }` `[CITED: docs.truv.com/api-reference/orders/orders_create]`. Test logins: `goodlogin`/`goodpassword` (full-time), `multiple.employments`/`goodpassword` (several employers), `hourly.part-time`/`goodpassword`; extra fields phone `(111)111-1111`, email `goodlogin@domain.com` `[CITED: test-credentials page]`. Spike (e) is gated on `TRUV_CLIENT_ID`/`TRUV_SECRET` existing as Worker secrets; none exist (CONTEXT) → record "blocked: no Truv keys" unless the user adds them.

### Q10. pnpm workspace, file-size check, engines

- `.npmrc` with `engine-strict=true` next to `app/package.json` (or at the repo root) makes `pnpm install` fail on an unsatisfied `engines.node` — proven with pnpm 10.32.1 (F-11). Add `"engines": { "node": ">=22.12" }` and `"packageManager": "pnpm@10.32.1"` `[ASSUMED: packageManager field is honoured by corepack/pnpm, harmless otherwise]`.
- Root `pnpm-workspace.yaml`: `packages:\n  - app`. pnpm expects a root `package.json` for workspace installs; add a minimal `{ "name": "resspark-root", "private": true, "scripts": { "check": "pnpm -C app check" } }` `[ASSUMED]`. Alternatively run everything with `pnpm -C app …` and skip the workspace file (simplest; D-02 asks for the workspace file, so include both).
- `app/scripts/check-file-sizes.mjs` (no dependencies): walk `src/`, `worker/`, `scripts/`, count `\n` in `*.{ts,tsx,mjs,js}`, fail with a list if any > 500; **exclude** `src/routeTree.gen.ts`, `worker-configuration.d.ts`, `dist/`, `node_modules/`, and `src/components/ui/**` (vendored shadcn primitives: `sidebar.tsx` is 728 lines, F-13; shadcn-admin's own ESLint ignores that folder). The `ui/**` exclusion is a judgement call against CLAUDE.md's rule — see Assumptions A-3; alternative is splitting `sidebar.tsx` into 3 files on day one.
- `pnpm check` = `node scripts/check-file-sizes.mjs && tsc -b && eslint . && vitest run`.

## Architecture Patterns

### System Architecture Diagram

```
                 Browser (staff)                               Browser (client phone)
                 ───────────────                               ──────────────────────
   /admin/*  SPA (sidebar shell)                               GET /c/<token>  (link from SMS/email)
      │  supabase-js signInWithPassword                               │
      ▼                                                               │ run_worker_first ["/c/*"]
   Supabase Auth ──ES256 JWT──► localStorage session                  ▼
      │                                                      Worker: decode → lookup client_links
      │ Authorization: Bearer <jwt>                                   → HMAC verify → expiry/revoked
      ▼                                                               │ ok: Set-Cookie rs_client (signed, HttpOnly)
   Worker /api/admin/* ── jose.jwtVerify(JWKS) ── app_metadata.firm_id  → 302 /c/   | fail: 404 (uniform)
      │                     │ staff_profiles check                      │
      │                     ▼                                           ▼
      │              supabase-js (sb_secret_, service_role)      /c/ → env.ASSETS.fetch(index.html) → placeholder page
      │                     │  log_event(...)  ──► events
      ▼                     ▼
   /api/config {app_env, …} → SANDBOX banner       Postgres (RLS on, anon/authenticated: no grants, 0 policies)
                                                        ▲
   Static assets (hashed) ◄── served by assets layer     │  supabase db query --linked (Management API, CLI login)
   Queue consumer (JOBS) / cron */15  ── same Worker ────┘  app/scripts/db-migrate.mjs → app_migrations
   Logger: allowlisted JSON only; platform invocation logs disabled
```

### Recommended Project Structure

```
app/
├── package.json  pnpm-lock.yaml  .npmrc(engine-strict=true)  wrangler.jsonc  vite.config.ts  vitest.config.ts
├── tsconfig.json  tsconfig.app.json  tsconfig.node.json  tsconfig.worker.json  components.json  eslint.config.js
├── .dev.vars.example  .env.example  LICENSES.md  index.html
├── scripts/
│   ├── check-file-sizes.mjs        # 500-line gate (PLAT-06)
│   ├── db-migrate.mjs              # supabase db query --linked per pending file → app_migrations
│   ├── create-staff.mjs            # auth.admin.createUser + staff_profiles (D-14)
│   └── reconcile-questions.mjs     # diff questions.py ids vs question_definitions (D-13; expected empty)
├── src/                            # SPA (forked shadcn-admin)
│   ├── main.tsx  routeTree.gen.ts  styles/  components/{ui,layout,data-table}/  hooks/  lib/
│   ├── lib/supabase.ts             # createClient(VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY)
│   ├── lib/api.ts                  # fetch wrapper: Bearer header, { error:{code,message} } envelope, type guards
│   ├── features/auth/sign-in/  features/dashboard/  features/errors/  features/settings/appearance/
│   ├── features/client-link/       # placeholder page for /c/
│   └── routes/
│       ├── __root.tsx
│       ├── admin/route.tsx          # /admin layout (no guard) → sign-in lives here
│       ├── admin/sign-in.tsx
│       ├── admin/_shell/route.tsx   # beforeLoad guard + AuthenticatedLayout (sidebar)
│       ├── admin/_shell/index.tsx   # empty dashboard
│       ├── c/$token.tsx             # never rendered in prod (Worker answers first); shows "ask your agent" on direct nav
│       └── c/index.tsx              # placeholder: "Your agent will send you a link" / cookie present → "Start" (Phase 2)
├── worker/
│   ├── vitest.config.ts  tsconfig.json
│   ├── src/index.ts                # Hono app + export default { fetch, queue, scheduled }
│   ├── src/env.ts                  # Env type re-export from worker-configuration.d.ts
│   ├── src/middleware/{request-id,logger,secure-headers,staff-auth}.ts
│   ├── src/auth/staff-jwt.ts       # jose verify
│   ├── src/auth/client-link.ts     # token mint/verify (HMAC), cookie sign/read
│   ├── src/db/{client,events,staff,client-links}.ts   # ONE data-access module, firm_id-scoped
│   ├── src/routes/{config,admin-session,client-link}.ts
│   ├── src/integrations/logics/write-guard.ts  (+ .test.ts)
│   ├── src/log/logger.ts  (+ .test.ts)
│   └── test/{rls.test.ts,client-link.test.ts,session.test.ts}
supabase/migrations/0002_platform_foundation.sql
docs/app/**                          # companion .md per file (CLAUDE.md)
pnpm-workspace.yaml  package.json(root, minimal)  .gitignore(fixed)
```

### Pattern 1: Worker-first client-link exchange
**What:** `run_worker_first: ["/c/*"]` so `GET /c/:token` hits Hono; success sets the signed cookie and `302`s to `/c/`; `/c/` and everything else under `/c/*` is handed to `env.ASSETS.fetch(request)` so the SPA still loads. **When to use:** any path that must be processed before the SPA sees it. **Example:** Code Example 7.

### Pattern 2: Verify-then-scope
**What:** `staffAuth` middleware verifies the JWT, loads `staff_profiles` by `sub`, and sets `c.var.staff = { userId, firmId, role }`; every `db/*` function takes `firmId` as its first argument. **When to use:** every `/api/admin/*` route. **Anti-pattern:** reading `firm_id` from a body/query.

### Pattern 3: Events via `log_event()`
**What:** plpgsql `log_event(p_firm_id, p_case_id, p_request_id, p_actor_type, p_actor_id, p_action, p_payload)` inserts into `events`; the Worker calls `admin.rpc('log_event', …)`; append-only is enforced by a `BEFORE UPDATE OR DELETE` trigger that raises. **When to use:** D-16 session events now; every mutation later.

### Anti-Patterns to Avoid
- **Reading `c.req.path` into logs:** use `routePath(c, -1)` (`'/c/:token'`) from `hono/route` — the pattern, never the concrete path `[CITED: hono.dev/docs/helpers/route]`.
- **`console.log(error)` of a caught error object:** Hono `HTTPException`/fetch errors carry URLs; log `error_code` only.
- **Creating the Supabase admin client at module scope:** create per request (cheap) `[CITED: STACK.md]`.
- **`SECURITY DEFINER` on `log_event`:** callable by `anon` by default `[CITED: supabase skill]`.
- **Forgetting `ALTER DEFAULT PRIVILEGES`:** every later migration's new table would silently get `anon` grants (F-6).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT signature/claims verification | manual base64 + ECDSA | `jose` `jwtVerify` + `createRemoteJWKSet` | kid rotation, caching, alg confusion defenses |
| Cookie signing/parsing | string concat | Hono `setSignedCookie`/`getSignedCookie` | attributes, prefixes, HMAC done |
| Constant-time MAC compare | `===` | `crypto.subtle.verify` / `timingSafeEqual` | timing leaks `[CITED: workers-best-practices]` |
| Request IDs | `Date.now()` | `hono/request-id` (`crypto.randomUUID()`) | collision-free, header passthrough |
| Security headers | ad-hoc `c.header` for all | `secureHeaders()` + two manual headers | consistent defaults |
| Env typing | hand-written `Env` | `wrangler types` → `worker-configuration.d.ts` | tracks bindings/secrets/vars automatically |
| Route tree | manual `createRoute` nesting | `@tanstack/router-plugin` file routes | already what the fork uses |
| Rate limiting | KV counters | Rate Limiting binding (fallback in-memory map) | no storage round-trips |

**Key insight:** every primitive in this phase has an official, tested implementation within an already-installed package; Phase 1's custom code is the ~300 lines that glue them and the SQL.

## Runtime State Inventory

This phase renames nothing but touches repo state and a live database, so the categories are answered explicitly.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | Supabase `zvkphuikjpwoauqdimcf`: 15 tables, 16,115 housing rows, 28 `question_definitions`, 0 auth users, 0 buckets, `supabase_migrations.schema_migrations` has 2 rows (F-7) | Additive migration `0002` only; do not write to `supabase_migrations.*`; seed `firms` (1 row) and 2 staff users via script |
| Live service config | Supabase Auth: sign-ups currently allowed (default; not probed — `/auth/v1/settings` needs an apikey) `[ASSUMED]`; Cloudflare: no Worker named `resspark`, no queues (F-2), Free plan (F-1) | Disable sign-up via `supabase config push` or dashboard; create Worker on first deploy; optional Paid upgrade |
| OS-registered state | None — verified by `git status`/`ls`: no scheduled tasks, services, or pm2 processes reference this project | none |
| Secrets/env vars | Root `.env` holds `OPENROUTER_*`, `CLOUDFLARE_API_TOKEN`; `src/frontend/.env` holds `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` (names from CONTEXT; values never read); no `sb_secret_`, Logics, Truv, Resend keys exist | User creates `sb_secret_` in Supabase **Settings > API Keys** and runs `wrangler secret put SUPABASE_URL / SUPABASE_SECRET_KEY / CLIENT_LINK_HMAC_KEY`; `.dev.vars` mirrors them locally |
| Build artifacts | `src/frontend/dist/` exists on disk but is untracked and ignored (F-9); `src/frontend/node_modules`, `venv/` | none for git; D-05's `git rm --cached` is a no-op (verify with `git ls-files src/frontend/dist \| wc -l` → 0) |

## Common Pitfalls

### Pitfall 1: The platform logs the token for you
**What goes wrong:** Workers invocation logs record "the request method and the request URL" for every fetch, so `/c/<token>` lands in Cloudflare's log store even if our logger redacts. **How to avoid:** `observability.logs.invocation_logs: false` (keeps `console.*` logs) `[CITED: workers-logs page]`; PLAT-08 test additionally greps a captured log line. **Warning signs:** a token string visible in the dashboard's Logs tab.

### Pitfall 2: New tables inherit `anon` grants
**What goes wrong:** `0002` creates `firms`…`client_links`; default ACL (F-6) grants `anon`/`authenticated` all privileges; RLS with zero policies still returns `200 []` not 401, and any later policy mistake exposes rows. **How to avoid:** the explicit `REVOKE` + `ALTER DEFAULT PRIVILEGES` block in Q4; `rls.test.ts` enumerates every table name including the new ones. **Warning signs:** the probe returns `200 []` instead of `401` for a table — grants exist.

### Pitfall 3: Free plan CPU budget
**What goes wrong:** works under `vite dev` (no CPU cap) but 1101/"exceeded CPU" in production; `limits` are "enforced only on Cloudflare's network, not locally" `[CITED: wrangler/configuration limits]`. **How to avoid:** upgrade to Paid before Oct 12, or keep Phase 1 handlers I/O-bound (JWT verify is ~1 ms; Supabase calls are await time). **Warning signs:** sporadic 500s only on `*.workers.dev`.

### Pitfall 4: `supabase db query` and the root `.env`
**What goes wrong:** D-08 says the CLI fails to parse the root `.env`; the probe (F-10) ran from a directory without one. **How to avoid:** `db-migrate.mjs` spawns the CLI with `cwd` = a scratch dir or `supabase/` and passes absolute `-f` paths (relative `--file` resolves against the workdir `[VERIFIED: query.handler.ts]`).

### Pitfall 5: Guarding the wrong layout
**What goes wrong:** putting `beforeLoad` on `admin/route.tsx` also guards `/admin/sign-in` → redirect loop. **How to avoid:** sign-in outside the pathless `_shell` guard (structure above); `validateSearch` keeps `redirect` typed `[VERIFIED: shadcn-admin (auth)/sign-in.tsx]`.

### Pitfall 6: Shadcn `ui/` files over 500 lines
**What goes wrong:** `check-file-sizes.mjs` fails on day one because `sidebar.tsx` is 728 lines (F-13). **How to avoid:** exclude `src/components/ui/**` as vendored (A-3) or split it before wiring the check.

### Pitfall 7: `getSession()` as authorization
**What goes wrong:** treating the locally stored user object as proof. **How to avoid:** the SPA gate is UX only; every `/api/admin/*` call is verified server-side (D-16); use `getClaims()` if the SPA needs verified claims `[CITED: supabase auth_methods]`.

### Pitfall 8: Vitest Workers project + jsdom
**What goes wrong:** one project with `environment: 'jsdom'` and `cloudflareTest` → pool rejects it. **How to avoid:** two projects (Q6).

## Code Examples

### 1. `app/worker/src/index.ts`
```ts
// Source: hono.dev (getting-started/cloudflare-workers, middleware docs); Cloudflare React guide
import { Hono } from 'hono'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import { logger } from './middleware/logger'
import { configRoute } from './routes/config'
import { adminSessionRoute } from './routes/admin-session'
import { clientLinkRoute } from './routes/client-link'

const app = new Hono<{ Bindings: Env }>()
app.use('*', requestId())
app.use('*', logger())
app.use('/api/*', secureHeaders())
app.use('/c/*', secureHeaders(), async (c, next) => {
  c.header('Cache-Control', 'no-store'); c.header('X-Robots-Tag', 'noindex'); await next()
})
app.onError((err, c) => c.json({ error: { code: 'internal', message: 'Something went wrong' } }, 500))
app.route('/api/config', configRoute)
app.route('/api/admin/session', adminSessionRoute)
app.route('/c', clientLinkRoute)
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))   // SPA fallback for /c/ etc.

export default {
  fetch: app.fetch,
  queue: async (_batch: MessageBatch, _env: Env) => {},            // Phase 4
  scheduled: async (_c: ScheduledController, _env: Env) => {},    // Phase 2+
} satisfies ExportedHandler<Env>
```

### 2. `/api/config` (D-19)
```ts
export const configRoute = new Hono<{ Bindings: Env }>().get('/', (c) =>
  c.json({ app_env: c.env.APP_ENV, logics_write_enabled: c.env.LOGICS_WRITE_ENABLED === 'true', app_name: 'ResSpark' }))
```

### 3. Staff auth middleware (Pattern 2)
```ts
// Source: supabase.com/docs/guides/auth/jwts (jose snippet); hono.dev HTTPException
import { HTTPException } from 'hono/http-exception'
import { verifyStaffJwt } from '../auth/staff-jwt'
import { getStaffProfile } from '../db/staff'
export const staffAuth = createMiddleware<{ Bindings: Env; Variables: { staff: StaffCtx } }>(async (c, next) => {
  const token = c.req.header('authorization')?.replace(/^Bearer /i, '')
  if (!token) throw new HTTPException(401, { message: 'unauthorized' })
  const claims = await verifyStaffJwt(token, c.env.SUPABASE_URL).catch(() => { throw new HTTPException(401, { message: 'unauthorized' }) })
  const profile = await getStaffProfile(c.env, claims.sub)              // service_role client, by user_id
  if (!profile || profile.firm_id !== claims.app_metadata?.firm_id) throw new HTTPException(403, { message: 'forbidden' })
  c.set('staff', { userId: claims.sub, firmId: profile.firm_id, role: profile.role })
  await next()
})
```

### 4. SPA Supabase client + API wrapper
```ts
// Source: supabase docs createClient options; D-07 env names
import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
export async function api<T>(path: string, init: RequestInit = {}, guard: (v: unknown) => v is T): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const res = await fetch(path, { ...init, headers: { ...init.headers, 'content-type': 'application/json',
    ...(data.session ? { authorization: `Bearer ${data.session.access_token}` } : {}) } })
  const body: unknown = await res.json()
  if (!res.ok) throw new ApiError(res.status, body)      // body is { error: { code, message } }
  if (!guard(body)) throw new ApiError(500, body)
  return body
}
```

### 5. Sign-in form submit (replaces the mock `toast.promise(sleep(2000))` in `user-auth-form.tsx`)
```ts
const { error } = await supabase.auth.signInWithPassword({ email, password })
if (error) { toast.error('Email or password is incorrect'); return }
await api('/api/admin/session', { method: 'POST', body: JSON.stringify({ event: 'signed_in' }) }, isOk)   // D-16 event
navigate({ to: redirectTo || '/admin', replace: true })
```

### 6. `app/worker/test/rls.test.ts` (PLAT-02)
```ts
// Source: PostgREST errors table (42501 → 401 for anon); Supabase api-keys guide (apikey header)
import { describe, it, expect } from 'vitest'
const TABLES = ['cases','question_definitions','case_financial_data','state_aliases','county_suffixes',
  'housing_utilities_standards','msa_county_standards','state_region_standards','national_standards',
  'health_care_standards','transportation_ownership_standards','transportation_operating_standards',
  'documents','document_extractions','determination_runs','firms','staff_profiles','events','client_links','app_migrations']
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY
describe.skipIf(!url || !key)('anon sees nothing', () => {
  for (const t of TABLES) it(t, async () => {
    const res = await fetch(`${url}/rest/v1/${t}?select=*&limit=1`, { headers: { apikey: key! } })
    const body = await res.json().catch(() => null)
    expect(res.status === 401 || (res.status === 200 && Array.isArray(body) && body.length === 0)).toBe(true)
  })
})
```
Run in the `web`/node project (plain `fetch`), not the Workers project, so it needs no bindings: `SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… pnpm vitest run --project web worker/test/rls.test.ts` (inject with `npx -y dotenv-cli -e app/.env -- …`; `VITE_` names can be mapped in the test).

### 7. Client-link exchange route (D-17/D-18)
```ts
// Source: Cloudflare signing-requests example (importKey/sign/verify); hono cookie helper
export const clientLinkRoute = new Hono<{ Bindings: Env }>()
  .get('/:token', async (c) => {
    const ip = c.req.header('cf-connecting-ip') ?? 'unknown'
    const { success } = await c.env.LINK_RATE_LIMITER.limit({ key: `link:${ip}` })   // fallback: in-memory map
    if (!success) return c.text('Too many requests', 429)
    const link = await verifyLinkToken(c.env, c.req.param('token'))   // null on ANY failure (bad length/MAC/unknown/expired/revoked)
    if (!link) return c.html(NOT_VALID_HTML, 404)
    await setSignedCookie(c, 'rs_client', JSON.stringify({ link_id: link.id, exp: Date.now() + 86_400_000 }),
      c.env.CLIENT_LINK_HMAC_KEY, { path: '/', httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 86_400 })
    return c.redirect('/c/', 302)
  })
```
```ts
// token = base64url(link_id(16) || HMAC-SHA256(key, link_id || version_be32)(32))
export async function mintLinkToken(key: CryptoKey, linkId: Uint8Array, version: number) {
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, concat(linkId, be32(version))))
  return Buffer.from(concat(linkId, mac)).toString('base64url')
}
export async function verifyLinkToken(env: Env, token: string) {
  const raw = Buffer.from(token, 'base64url'); if (raw.length !== 48) return null
  const linkId = raw.subarray(0, 16), mac = raw.subarray(16)
  const row = await findClientLink(env, linkId)                      // by id; service_role
  if (!row) return null
  const key = await hmacKey(env.CLIENT_LINK_HMAC_KEY)
  const ok = await crypto.subtle.verify('HMAC', key, mac, concat(linkId, be32(row.version)))
  if (!ok || row.revoked_at || new Date(row.expires_at) <= new Date()) return null
  return row
}
```

### 8. `/api/admin/session` (D-16, PLAT-04)
```ts
export const adminSessionRoute = new Hono<{ Bindings: Env; Variables: { staff: StaffCtx } }>()
  .use('*', staffAuth)
  .post('/', async (c) => {
    const { event } = await c.req.json<{ event: 'signed_in' | 'signed_out' }>()
    if (event !== 'signed_in' && event !== 'signed_out') return c.json({ error: { code: 'bad_request', message: 'event' } }, 400)
    await logEvent(c.env, { firm_id: c.var.staff.firmId, actor_type: 'staff', actor_id: c.var.staff.userId, action: `staff.${event}` })
    return c.json({ ok: true })
  })
```
(`signed_out` is posted **before** `supabase.auth.signOut()` so the bearer token is still valid.)

### 9. `logicsWriteGuard` (D-19, PLAT-05)
```ts
export function logicsWriteGuard(env: Pick<Env, 'LOGICS_WRITE_ENABLED' | 'LOGICS_TEST_CASE_IDS'>, caseId: string) {
  const allow = env.LOGICS_TEST_CASE_IDS.split(',').map((s) => s.trim()).filter(Boolean)
  if (env.LOGICS_WRITE_ENABLED !== 'true' || !allow.includes(caseId))
    throw new Error('logics_write_blocked')   // never includes caseId or env values
}
// test: flag off → throws; flag on + id not listed → throws; flag on + listed → returns
```

### 10. Allowlisted logger (D-20, PLAT-08)
```ts
// Source: hono/route routePath (pattern, not path); hono/request-id
import { routePath } from 'hono/route'
const FIELDS = ['request_id','route','method','status','duration_ms','firm_id','actor_id','error_code'] as const
export const logger = () => createMiddleware(async (c, next) => {
  const start = Date.now(); await next()
  const rec = { request_id: c.get('requestId'), route: routePath(c, -1) ?? '/[unmatched]', method: c.req.method,
    status: c.res.status, duration_ms: Date.now() - start, firm_id: c.get('staff')?.firmId, actor_id: c.get('staff')?.userId,
    error_code: c.get('errorCode') }
  console.log(JSON.stringify(Object.fromEntries(FIELDS.map((k) => [k, rec[k]]))))   // only allowlisted keys
})
// test: app.request('/c/abcdef…', {}, env) with console.log spied → captured line contains '/c/:token' and not the token
```

### 11. `check-file-sizes.mjs`
```js
import { readdirSync, readFileSync, statSync } from 'node:fs'; import { join } from 'node:path'
const SKIP = [/node_modules/, /\/dist\//, /routeTree\.gen\.ts$/, /worker-configuration\.d\.ts$/, /src\/components\/ui\//]
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p] })
const bad = ['src','worker','scripts'].flatMap(walk).filter((p) => /\.(ts|tsx|mjs|js)$/.test(p) && !SKIP.some((r) => r.test(p.replace(/\\/g,'/'))))
  .map((p) => [p, readFileSync(p, 'utf8').split('\n').length]).filter(([, n]) => n > 500)
if (bad.length) { console.error(bad.map(([p, n]) => `${p}: ${n} lines`).join('\n')); process.exit(1) }
```

### 12. Migration `0002` skeleton (D-11/D-12)
```sql
BEGIN;
CREATE TABLE IF NOT EXISTS public.firms (id uuid primary key default gen_random_uuid(), name text not null, settings jsonb not null default '{}', created_at timestamptz not null default now());
CREATE TABLE IF NOT EXISTS public.staff_profiles (user_id uuid primary key references auth.users(id) on delete cascade, firm_id uuid not null references public.firms(id), role text not null check (role in ('staff','admin')), display_name text not null, created_at timestamptz not null default now());
CREATE TABLE IF NOT EXISTS public.events (id bigint generated always as identity primary key, firm_id uuid not null references public.firms(id), case_id uuid references public.cases(id), request_id uuid, actor_type text not null check (actor_type in ('staff','client','system','provider')), actor_id text, action text not null, payload jsonb not null default '{}', created_at timestamptz not null default now());
CREATE TABLE IF NOT EXISTS public.client_links (id uuid primary key default gen_random_uuid(), firm_id uuid not null references public.firms(id), request_id uuid, version int not null default 1, expires_at timestamptz not null, revoked_at timestamptz, opened_at timestamptz, created_by uuid references auth.users(id), created_at timestamptz not null default now());
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS firm_id uuid references public.firms(id), ADD COLUMN IF NOT EXISTS logics_case_id bigint, ADD COLUMN IF NOT EXISTS retention_until timestamptz;
CREATE INDEX IF NOT EXISTS events_firm_created_idx ON public.events (firm_id, created_at desc);
CREATE INDEX IF NOT EXISTS staff_profiles_firm_idx ON public.staff_profiles (firm_id);
CREATE OR REPLACE FUNCTION public.log_event(p_firm_id uuid, p_case_id uuid, p_request_id uuid, p_actor_type text, p_actor_id text, p_action text, p_payload jsonb default '{}')
RETURNS bigint LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  INSERT INTO public.events (firm_id, case_id, request_id, actor_type, actor_id, action, payload)
  VALUES (p_firm_id, p_case_id, p_request_id, p_actor_type, p_actor_id, p_action, coalesce(p_payload,'{}')) RETURNING id $$;
CREATE OR REPLACE FUNCTION public.events_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'events is append-only'; END $$;
DROP TRIGGER IF EXISTS events_append_only ON public.events;
CREATE TRIGGER events_append_only BEFORE UPDATE OR DELETE ON public.events FOR EACH ROW EXECUTE FUNCTION public.events_append_only();
INSERT INTO public.firms (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'ValorTax') ON CONFLICT (id) DO NOTHING;
-- grants block from Q4 goes here (ENABLE RLS on the 5 new tables; REVOKE …; ALTER DEFAULT PRIVILEGES …; REVOKE EXECUTE on log_event FROM public, anon, authenticated)
COMMIT;
```
(Column names are D-11's; the ARCHITECTURE.md `events` shape with `item_id`/`ip`/`user_agent` is a Phase 3 additive change.)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@cloudflare/vitest-pool-workers` | `@cloudflare/vitest-plugin` (`cloudflareTest()`, `cloudflare:test`) | Aug 2026 `[CITED: STACK.md changelog read]` | Install the new name only |
| Supabase `anon`/`service_role` JWT keys | `sb_publishable_` / `sb_secret_` (strings, `apikey` header) | deprecation by end of 2026 | Worker secret is `sb_secret_`; SPA gets `sb_publishable_` |
| Supabase HS256 shared JWT secret | ES256 signing keys + JWKS (`/.well-known/jwks.json`) | default for new projects; this project has it (F-3) | No `SUPABASE_JWT_SECRET` anywhere |
| `@supabase/server` framework adapters | `@supabase/middleware` pipeline + per-framework bridge | deprecated, removal 2026-12-01 | Use `jose` directly in Phase 1 |
| `wrangler.toml` + hand-written `Env` | `wrangler.jsonc` + `wrangler types` + `secrets.required` | wrangler 4.x | Types track config |
| Cloudflare Pages + separate API | Workers static assets, one deploy, output `wrangler.json` from Vite | 2025–2026 | D-01's model |

**Deprecated/outdated:** `@cloudflare/workers-types` (superseded by `wrangler types`, though the vitest fixtures still reference `@cloudflare/workers-types/experimental` — harmless); shadcn-admin's Vitest browser mode (dropped for jsdom); `auth.role()` in policies (not used).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A-1 | Rate Limiting binding is available on the Workers Free plan and in `vite dev`/vitest | Q5 | Deploy rejects `ratelimits`; use D-18's in-memory fallback (planned) |
| A-2 | Multi-statement SQL through `/database/query` runs as one implicit transaction; no payload size limit matters for our file sizes | Q4 | A partial apply would need manual cleanup; mitigated by explicit `BEGIN/COMMIT` and `IF NOT EXISTS` |
| A-3 | Excluding vendored `src/components/ui/**` from the 500-line check satisfies CLAUDE.md's "skip generated, vendored" clause | Q10 | If the user disagrees, split `sidebar.tsx` (728 lines) into 3 files on day one |
| A-4 | `supabase link` without a DB password is enough for `supabase config push` to disable sign-ups; the dashboard toggle label is "Allow new users to sign up" | Q3 | Fall back to the Management API `PATCH …/config/auth {disable_signup:true}` with a scoped PAT, or the dashboard |
| A-5 | `signInWithPassword` keeps working when `disable_signup` is true | Q3 | Staff could not sign in; would surface immediately in the smoke test |
| A-6 | Hono `setSignedCookie` uses HMAC-SHA256; `cf-connecting-ip` carries the client IP | Q5 | Cookie forgery resistance still holds (any HMAC); IP key falls back to `'unknown'` |
| A-7 | A root `package.json` is required for `pnpm-workspace.yaml`; `packageManager` field is honoured | Q10 | Minor: run `pnpm -C app` instead |
| A-8 | Default ACL from `supabase_admin` (F-6) does not apply to tables created through the Management API (owner is `postgres`) | Q4 | `rls.test.ts` catches any leaked grant; add `REVOKE` to every migration |
| A-9 | Supabase Auth sign-ups are currently enabled on the project (default) | Runtime State | None if already disabled; the push is idempotent |
| A-10 | Free-plan 10 ms CPU is enough for Phase 1 handlers (JWT verify + 1–2 Supabase calls) | Q2 | 1102 CPU errors in prod; the Paid checkpoint covers it |

## Open Questions (RESOLVED)

1. RESOLVED: CONTEXT D-06 update — the account is on Workers Paid (verified via the subscriptions API 2026-10-10); no checkpoint needed. **Upgrade to Workers Paid before the Oct 12 demo?** What we know: account is Free (F-1); Email Sending and >10 ms CPU need Paid ($5/mo). Recommendation: `checkpoint:human-verify` in the first plan; proceed either way (Queues/cron work on Free).
2. RESOLVED: Plan 05 `app/scripts/provision-secrets.mjs` fetches the key via `supabase projects api-keys` and pipes values into `wrangler secret put` over stdin; a missing key degrades to a USER ACTION REQUIRED note. **Who creates the `sb_secret_` key and runs `wrangler secret put`?** What we know: 0 secrets exist; the Bash guard blocks reading `.env`. Recommendation: a checkpoint task listing the three `wrangler secret put` commands and the `.dev.vars` lines (names only).
3. RESOLVED: Plan 01 excludes vendored `app/src/components/ui/**` from the 500-line gate (CLAUDE.md exempts vendored code). **Is the 500-line `ui/**` exclusion acceptable (A-3)?** Recommendation: ask in the first plan's checkpoint; default to exclusion.
4. RESOLVED (as a recorded question for Andrew, Plan 08 spike f; Phase 5 research defaults `ActivityType` to `General` and omits `FileCategoryID`). **Logics scopes/`FileCategoryID`/`ActivityType` (spike f)** — question for Andrew; record in the plan summary, no code.
5. RESOLVED (Plan 08 spike e records "blocked: no Truv keys" unless secrets exist). **Truv keys (spike e)** — blocked until secrets exist; record "blocked: no Truv keys" unless provided.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | toolchain, Vitest 5 (`^22.12 \|\| ^24`) | ✓ | 24.14.0 | — |
| pnpm | D-02 | ✓ | 10.32.1 (honours `engine-strict`) | — |
| wrangler (authenticated) | deploy, secrets, queues | ✓ | 4.149.0 | — |
| Cloudflare Workers plan | PLAT-01; CPU budget; Email Sending | **Free** (no subscription) | — | Deploy on Free; Resend for email; upgrade checkpoint |
| Cloudflare Queues | D-06 | ✓ on Free (10k ops/day, 24 h retention) | — | Deploy without `queues` block if creation fails |
| Supabase CLI (logged in) | migrations via Management API, `config push` | ✓ | 2.120.0 (`db query` ≥ 2.79 ✓) | — |
| Supabase project | everything | ✓ `zvkphuikjpwoauqdimcf`, Postgres 17.6, ES256 JWKS | — | — |
| `sb_secret_` key / Worker secrets | Worker data path, `create-staff.mjs`, `rls.test.ts` (publishable only) | ✗ (not created yet) | — | None — blocking for admin session + staff creation; user action |
| Docker (pgTAP) | not used (D-12) | not probed | — | Vitest PostgREST probe |
| Resend API key | Phase 2 email | ✗ | — | Copyable link remains the guaranteed path |
| Truv sandbox keys | spike (e) | ✗ | — | Record blocked |
| git | hygiene | ✓ | 2.52 | — |

**Missing dependencies with no fallback:** Supabase secret key + the three Worker secrets (user must create/set them before the session and staff-creation tasks can be verified).
**Missing dependencies with fallback:** Workers Paid (Free works for Phase 1 scope), Email Service (Resend), Truv keys (record blocked), Rate Limiting binding if unavailable on Free (in-memory).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.3 with `projects`: `web` (jsdom + node-style tests) and `worker` (`@cloudflare/vitest-plugin` 1.4.0; falls back to `app.request()` in `web` if spike (a) fails) |
| Config file | `app/vitest.config.ts`, `app/worker/vitest.config.ts` — none exist yet (Wave 0) |
| Quick run command | `pnpm -C app vitest run --project web` |
| Full suite command | `pnpm -C app check` (= file-size gate + `tsc -b` + eslint + `vitest run`) and `python -m unittest discover -s src/tests -v` (unchanged Python oracle) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLAT-01 | Public URL serves SPA, `/api/config`, and `/webhooks/*` 404-from-Worker from one deploy | smoke (post-deploy) | `curl -sI https://resspark.<sub>.workers.dev/admin \| head -1` → 200; `curl -s …/api/config` → JSON with `app_env`; `curl -s -o /dev/null -w '%{http_code}' …/webhooks/x` → 404 JSON from the Worker (not index.html) | ❌ Wave 0 (`app/scripts/smoke.mjs`) |
| PLAT-02 | anon returns 0 rows / 401 on every public table | integration (live) | `npx -y dotenv-cli -e app/.env -- pnpm -C app vitest run --project web worker/test/rls.test.ts` | ❌ Wave 0 |
| PLAT-03 | SPA bundle contains no `sb_secret_`; Worker secrets declared | static | `grep -r "sb_secret_" app/dist/client && exit 1 \|\| true` plus `secrets.required` in `wrangler.jsonc` (deploy fails if unset) | ❌ Wave 0 (script line in `check`) |
| PLAT-04 | `POST /api/admin/session` writes `staff.signed_in`/`signed_out` events | integration | `vitest run --project worker worker/test/session.test.ts` (live Supabase with `.dev.vars`) or `supabase db query --linked … "select action from events order by id desc limit 2"` | ❌ Wave 0 |
| PLAT-05 | `logicsWriteGuard` throws unless flag on + id allowlisted; banner when `APP_ENV !== production` | unit + component | `vitest run --project web worker/src/integrations/logics/write-guard.test.ts src/features/layout/sandbox-banner.test.tsx` | ❌ Wave 0 |
| PLAT-06 | `.gitignore` entries, no tracked dist, engines, one lockfile, 500-line gate | script | `git check-ignore -q .env.local app/.dev.vars src/frontend/dist/index.html && test "$(git ls-files src/frontend/dist \| wc -l)" = 0 && test ! -e app/package-lock.json && node app/scripts/check-file-sizes.mjs` | ❌ Wave 0 (`app/scripts/hygiene-check.sh`) |
| PLAT-07 | Sign-in persists across refresh; `/admin/*` redirects without session; API 401 without token | component + integration | `vitest run --project web src/routes/admin/guard.test.tsx` (mock `supabase.auth.getSession`) and `vitest run --project worker worker/test/auth.test.ts` (no token → 401; garbage token → 401) | ❌ Wave 0 |
| PLAT-08 | Log line for a failing `/c/<token>` request contains no token; only allowlisted keys | unit | `vitest run --project web worker/src/log/logger.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm -C app vitest run --project web` (sub-10 s) + `node app/scripts/check-file-sizes.mjs`
- **Per wave merge:** `pnpm -C app check` + `python -m unittest discover -s src/tests -v`
- **Phase gate:** full suite green, `rls.test.ts` green against the live project, deployed smoke script green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `app/vitest.config.ts` + `app/worker/vitest.config.ts` — projects split (spike (a) decides whether the worker project uses the plugin)
- [ ] `app/worker/test/rls.test.ts` — PLAT-02
- [ ] `app/worker/test/{auth,session,client-link}.test.ts` — PLAT-04/07, token primitives
- [ ] `app/worker/src/log/logger.test.ts`, `app/worker/src/integrations/logics/write-guard.test.ts` — PLAT-08/05
- [ ] `app/scripts/{check-file-sizes.mjs,hygiene-check.sh,smoke.mjs}` — PLAT-06/01
- [ ] Framework install: `pnpm -C app add -D vitest@5.0.3 @cloudflare/vitest-plugin@1.4.0 jsdom@30.1.2`

## Security Domain

### Applicable ASVS Categories (Level 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Supabase Auth email+password; sign-ups disabled; admin-created users; `jose` JWKS verification; no MFA until Phase 8 |
| V3 Session Management | yes | supabase-js session (localStorage, auto-refresh); client link → signed `HttpOnly; Secure; SameSite=Lax` cookie, 24 h; sign-out event |
| V4 Access Control | yes | `firm_id` from `app_metadata` cross-checked with `staff_profiles`; one `db/` module; RLS deny-by-default; Worker-only data path |
| V5 Input Validation | yes | Zod (`@hono/standard-validator` from Phase 2); Phase 1 validates the `event` enum and token length/format by hand; type guards at the SPA boundary |
| V6 Cryptography | yes | Web Crypto HMAC-SHA256 (`crypto.subtle`), `crypto.getRandomValues`, `crypto.subtle.verify` constant-time; no hand-rolled hashing |
| V7 Logging | yes | Allowlisted JSON logger; invocation logs disabled; no bodies/headers/tokens |
| V14 Configuration | yes | `secrets.required`; `.dev.vars`/`.env*`/`.wrangler` git-ignored; `vars` hold only non-secret flags |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Token in URL leaks via Referer/logs/history | Information disclosure | Worker-first exchange → cookie → 302; `Referrer-Policy: no-referrer`; `no-store`; `noindex`; invocation logs off; `routePath` in our logs |
| Token guessing | Spoofing | 128-bit id + 256-bit MAC; uniform 404; Rate Limiting binding per IP |
| Cross-firm/IDOR via body-supplied ids | Elevation of privilege | `firm_id` only from verified claims + profile; never from request |
| `user_metadata` in authz | Elevation | `app_metadata` only (admin API sets it) |
| New table gets `anon` grants | Information disclosure | `REVOKE` + `ALTER DEFAULT PRIVILEGES` + `rls.test.ts` per table |
| Secret key in SPA | Information disclosure | Only `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY`; grep of `dist/client` |
| Accidental Logics write during demo | Tampering | `logicsWriteGuard` (server-side), `LOGICS_WRITE_ENABLED=false` default, SANDBOX banner |
| `SECURITY DEFINER` function callable by anon | Elevation | `log_event` is `SECURITY INVOKER`; `REVOKE EXECUTE … FROM public, anon, authenticated` |
| CSRF on cookie-authenticated `/api/c/*` (Phase 2) | Spoofing | `SameSite=Lax` now; `X-Requested-With` header check when `/api/c/*` arrives |

## Sources

### Primary (HIGH confidence — live probes and official docs read this session)
- Live probes: Cloudflare `GET /accounts/{id}/subscriptions`, `wrangler whoami`, `wrangler queues list`; Supabase JWKS endpoint; `supabase db query --linked` inventory queries (pg_tables, pg_policies, role_table_grants, pg_default_acl, counts); local `git`, `cat -A`, pnpm engine-strict probe; `src/questions.py` vs `database_schema.sql` id diff.
- Context7 `/llmstxt/developers_cloudflare_workers_llms-full_txt`: React+Vite plugin guide, SPA `assets` config, Rate Limiting binding, Queues pricing/CLI, Workers Logs `invocation_logs`, `secrets.required`, `.dev.vars`, signing-requests example, best practices (timingSafeEqual), limits (subrequests 50/10,000), `wrangler types`, `.wrangler/deploy/config.json`.
- Context7 `/cloudflare/workers-sdk`: vitest-plugin fixtures (`cloudflareTest`, `cloudflare:test`, tsconfig types, jsdom restriction).
- Context7 `/supabase/supabase`: JWT verification with `jose`/JWKS, JWT claim fields, `auth.admin.createUser`, `config.toml` `auth.enable_signup`, client options, auth methods (`getClaims`/`getSession`), resumable uploads + signed Uppy example.
- Context7 `/supabase/cli` + `supabase … --help`: `db query` flags and Management API dispatch; `config push`.
- Context7 `/supabase/server` + raw GitHub `supabase/server` docs (`adapters/hono.md` deprecation notice, `environment-variables.md`, `api-reference.md`, `examples/frameworks/hono/*`).
- Context7 `/websites/hono_dev`: cookie helper, secure headers table, request-id, route helper (`routePath`), testing (`app.request` with env), Workers entry shape, `HTTPException`.
- Context7 `/tanstack/router`: pathless layouts, route groups, `beforeLoad` + `redirect`, `notFound`.
- Raw GitHub `satnaing/shadcn-admin@main` (`e16c87f`): package.json, vite.config.ts, components.json, tsconfig*, main.tsx, routes, auth-store, handle-server-error, clerk route, faker data files, sidebar-data, line counts.
- `api.supabase.com/api/v1-json` OpenAPI: `/database/query` body, `/config/auth` fields; `supabase/postgres-meta` `routes/query.ts`, `lib/db.ts`; `PostgREST/postgrest-docs` `errors.rst` (42501 mapping).
- Project files: `01-CONTEXT.md`, `REQUIREMENTS.md`, `STATE.md`, `research/STACK.md`, `research/ARCHITECTURE.md`, `research/PITFALLS.md` (C1, C2, C3, C12, C14), `src/schemas/database_schema.sql`, `.agents/skills/supabase/SKILL.md`, root `CLAUDE.md`, `src/frontend/package.json`/configs.

### Secondary (MEDIUM confidence — official pages via WebFetch summaries)
- developers.cloudflare.com: `email-service` (Beta, Paid), `email-service/get-started/send-emails`, `queues/platform/pricing`, `workers/platform/pricing`, `workers/configuration/cron-triggers`, `workers/vite-plugin/reference/static-assets`, `workers/runtime-apis/bindings/rate-limit`, `workers/observability/logs/workers-logs`.
- supabase.com/docs/guides/api/api-keys (key prefixes, `apikey` header, deprecation).
- docs.truv.com (test-credentials, orders_create); resend.com (send-email API, pricing); vitest.dev/guide/projects.

### Tertiary (LOW confidence — search only)
- WebSearch for Vitest 5 + `@cloudflare/vitest-plugin` compatibility: nothing conclusive (spike (a) stands).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions from the registry today; STACK.md verified 2026-10-10; one package (`@supabase/server`) demoted on its own deprecation notice.
- Architecture: HIGH — Cloudflare/Supabase/Hono mechanics from official docs; live DB/plan state probed.
- Pitfalls: HIGH for the five that come from probes (invocation logs, default ACL, Free CPU, `.env` parse, `ui/` sizes); MEDIUM for the Vitest/jsdom split (fixture-derived).

**Research date:** 2026-10-10
**Valid until:** 2026-11-10 for docs-derived facts; the live-probe facts (plan, grants, user count) are valid until the first plan executes.
