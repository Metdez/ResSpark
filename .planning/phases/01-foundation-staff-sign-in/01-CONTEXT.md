# Phase 1: Foundation & Staff Sign-In - Context

**Gathered:** 2026-10-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 delivers a deployed, secured base that every later phase builds on: a new React + Vite + shadcn/ui SPA (forked from `satnaing/shadcn-admin`, MIT) with two route trees, a Hono API Worker on Cloudflare that serves the SPA and the API from one deploy, additive Supabase migrations with RLS and an event log, staff sign-in, the client-link token and cookie primitives, demo safety flags, an allowlisted logger, repo hygiene, and the day-one spikes. No Logics lookup, no client portal screens, no uploads, no provider connects: those start in Phase 2. Requirements: PLAT-01 through PLAT-08.

</domain>

<decisions>
## Implementation Decisions

Discussion ran in `--auto` mode (non-interactive session). Each decision below is the recommended option, chosen on the strength of `.planning/research/SUMMARY.md`, the codebase maps, and what Andrew asked for on the call. Review and override any of them in this file before planning if they look wrong.

### Repo layout and toolchain
- **D-01:** The new app lives in a new top-level `app/` directory as ONE Vite project: `app/src/` (SPA) and `app/worker/` (Hono API, queue consumer, cron), built with `@cloudflare/vite-plugin` and deployed by `wrangler` as one Worker with static assets. The old `src/frontend/` is frozen (no new work, tests left as-is) and is deleted in Phase 7 when the intake screens are rebuilt. Python `src/*.py` stays untouched. — **Reversibility:** costly — paths are referenced by `wrangler.jsonc`, `docs/`, CI, and the companion-doc convention; moving later means touching all of them.
- **D-02:** Package manager is pnpm (10.32 is installed; shadcn-admin ships a pnpm lockfile). A root `pnpm-workspace.yaml` lists `app` only. `src/frontend/package-lock.json` stays as legacy until that folder is deleted; a note in `src/frontend/README.md` marks it legacy. The PLAT-06 "one lockfile" check applies to `app/`. Node engines `>=22.12` in `app/package.json`.
- **D-03:** Fork `satnaing/shadcn-admin` by copying its `src/components`, `src/features` (only the layout, sidebar, header, command palette, data-table, and auth screens), `src/styles`, `components.json`, and config files into `app/`. Strip Clerk, axios, faker, the demo pages (tasks, apps, chats, users). Keep TanStack Router 1.168, TanStack Query 5.99, TanStack Table 8.21 (pin, do not take v9), Zod 4, Tailwind 4, TypeScript `~6.0.3` (not 7). Every copied file keeps the MIT attribution in `app/LICENSES.md`.
- **D-04:** Two route trees in one router: `/admin/*` (staff, sidebar layout, auth-gated) and `/c/$token` (client, minimal centered mobile layout, no sidebar, no analytics). Code-split so the `/c/*` bundle does not pull in the admin shell. Phase 1 ships the admin shell with an empty dashboard and a placeholder `/c/$token` page that only performs the token-to-cookie exchange and shows "Your agent will send you a link" when the token is invalid.
- **D-05:** Repo hygiene lands first, in its own plan: fix the merged `.envnode_modules/` line in `.gitignore` into `.env`, `.env.*` (except `.env.example`), `node_modules/`, and `dist/`; `git rm -r --cached src/frontend/dist`; add `app/scripts/check-file-sizes.mjs` (fails on any code file over 500 lines, excluding generated files) wired into `pnpm check`.

### Hosting and deploy
- **D-06:** Worker name `resspark`, deployed to the free `*.workers.dev` subdomain for the demo (custom domain is a later polish item). `wrangler.jsonc` sets `assets.not_found_handling: "single-page-application"` and `run_worker_first: ["/api/*", "/webhooks/*"]`, `compatibility_flags: ["nodejs_compat"]`, one cron trigger `*/15 * * * *`, and (if the account is on Workers Paid) a queue `resspark-jobs` with a dead-letter queue `resspark-jobs-dlq`. If queue creation fails because the account is on the Free plan, deploy without the queue, process webhooks inline plus cron reconcile, and surface "upgrade to Workers Paid ($5/mo)" as a blocker note in the plan summary. — **Reversibility:** reversible — adding the queue later is a config change plus one consumer file.
- **D-07:** Secrets live only as Worker secrets set with `wrangler secret put` (SUPABASE_URL, SUPABASE_SECRET_KEY, CLIENT_LINK_HMAC_KEY, LOGICS_* placeholders, later provider keys). Local dev reads them from `app/.dev.vars` (git-ignored). The SPA receives only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (the existing values in `src/frontend/.env` are reused by copying that file to `app/.env`; never print them). Use `sb_publishable_` / `sb_secret_` keys, not legacy anon/service_role.
- **D-08:** The Bash secret guard blocks reading `.env`; run wrangler and the Supabase CLI through `npx -y dotenv-cli -- <cmd>` from the repo root so the token stays in the child process, and run `supabase db query --linked --project-ref zvkphuikjpwoauqdimcf` from a directory without the root `.env` (the CLI fails to parse it). Record both in `docs/app/README.md`.

### Data: Supabase project, migrations, RLS
- **D-09:** Use the existing Supabase project `zvkphuikjpwoauqdimcf` ("ResSpark"). The 15 baseline tables from `src/schemas/database_schema.sql` are already applied with IRS standards seeded; migrations are additive only. — **Reversibility:** one-way — the standards data (16,115 housing rows) and the existing table names are the engine's contract; dropping or renaming them breaks `src/standards_repository.py` and Phase 7.
- **D-10:** Migrations are plain SQL files in `supabase/migrations/NNNN_<name>.sql`, applied in order by `app/scripts/db-migrate.mjs`, which runs each pending file through `supabase db query --linked -f` and records it in a new `app_migrations (name, applied_at)` table. Reason: `supabase db push` needs the database password, which is not available; the Management API path works with the CLI's stored login. — **Reversibility:** reversible — switching to `supabase db push` later only needs the password and a one-time backfill of `supabase_migrations.schema_migrations`.
- **D-11:** Phase 1 migration `0002_platform_foundation.sql` adds: `firms` (one row seeded: ValorTax, with `settings jsonb` for Logics config placeholders), `staff_profiles` (`user_id` → `auth.users`, `firm_id`, `role` in staff|admin, `display_name`), `events` (`id`, `firm_id`, `case_id` nullable, `request_id` nullable, `actor_type` in staff|client|system|provider, `actor_id` text, `action` text, `payload jsonb`, `created_at`), `client_links` (`id`, `firm_id`, `request_id` nullable for now, `version` int, `expires_at`, `revoked_at`, `opened_at`, `created_by`), and adds `firm_id`, `logics_case_id`, `retention_until` to the existing `cases` table (nullable, additive). Later phases add `requests`, `request_items`, `connections`, `connection_secrets`, `webhook_events`, `logics_pushes`, `consents` in their own migrations. The `log_event(...)` plpgsql function inserts an `events` row; mutations that must be atomic with their event call RPCs (introduced per phase).
- **D-12:** RLS is enabled on every public table (the 15 baseline tables plus the new ones) with default grants to `anon` and `authenticated` revoked and NO policies for those roles in v1. The Worker is the only data path, using the secret key. The PLAT-02 proof is a Vitest integration test (`app/worker/test/rls.test.ts`) that calls PostgREST with the publishable key for every public table and asserts 0 rows or 401, run against the live project with env vars. pgTAP is not used (needs local Docker). — **Reversibility:** reversible — adding staff `SELECT` policies for direct reads or Realtime later is additive.
- **D-13:** Reconcile the question contract in Phase 1: a script diffs `src/questions.py` (32) against `question_definitions` (28 rows) and inserts the missing rows additively so the database matches the code's 32-question contract. Output the diff in the plan summary; do not change `src/questions.py`.

### Staff authentication and the data path
- **D-14:** Staff sign in with Supabase Auth email + password. Public sign-up is disabled; staff accounts are created by `app/scripts/create-staff.mjs` (admin API with the secret key) which also writes `staff_profiles` and sets `app_metadata.firm_id` and `app_metadata.role` (never `user_metadata`). Magic link and MFA are not in Phase 1 (MFA is Phase 8). For the demo, seed two users: one for Zack and one labeled "Andrew (case manager)". — **Reversibility:** reversible.
- **D-15:** The SPA uses `supabase-js` for the auth session only (sign in, refresh, sign out) and sends the access token as `Authorization: Bearer` to the Worker. The Worker verifies the JWT (spike: `@supabase/server` Hono adapter first; fallback `jose` with the project JWKS) and loads `staff_profiles` to get `firm_id`. Every `/api/admin/*` route requires a verified staff user; every data query is scoped by that `firm_id` in one data-access module (`app/worker/src/db/`). The SPA never calls PostgREST for data in v1. — **Reversibility:** reversible.
- **D-16:** Route guard: TanStack Router `beforeLoad` on the `/admin` layout redirects to `/admin/sign-in` when there is no session; the Worker returns 401 JSON for API calls without a valid token. Sign-in and sign-out each call `/api/admin/session` so the Worker writes `events` rows (`staff.signed_in`, `staff.signed_out`) with actor id and timestamp (PLAT-04 proof).

### Client-link token and cookie primitives (used by Phase 2 screens)
- **D-17:** Token format is `base64url(link_id || HMAC-SHA256(CLIENT_LINK_HMAC_KEY, link_id || version))`, verified against the `client_links` row (`expires_at`, `revoked_at`, `version`). Staff can re-copy a link because the token is re-derived, not stored. Default expiry 14 days; revoke sets `revoked_at`; regenerate bumps `version`. — **Reversibility:** costly — links already sent to clients embed the format; changing it invalidates them (mitigated by `version` and re-sending).
- **D-18:** `GET /c/:token` is served by the Worker (not the SPA) and only exchanges a valid token for an HttpOnly, Secure, SameSite=Lax cookie `rs_client` (a signed session value holding `link_id`, 24-hour lifetime), then redirects to `/c/` with no token in the URL. The page sends `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, and `X-Robots-Tag: noindex`. A GET never marks the link opened; Phase 2's Start tap does. Token guessing is rate-limited per IP with the Workers Rate Limiting binding (fallback: an in-memory sliding window per isolate plus a 404 for all failures).

### Demo safety and logging
- **D-19:** Worker vars: `APP_ENV` (`sandbox` or `production`), `LOGICS_WRITE_ENABLED` (default `false`), `LOGICS_TEST_CASE_IDS` (comma list). The SPA fetches `/api/config` and shows a persistent SANDBOX banner whenever `APP_ENV !== "production"`. A `logicsWriteGuard(caseId)` function in `app/worker/src/integrations/logics/` throws unless the flag is true and the id is allowlisted; Phase 1 ships the guard with a unit test even though no Logics write exists yet.
- **D-20:** One structured JSON logger with an explicit field allowlist: `request_id`, `route`, `method`, `status`, `duration_ms`, `firm_id`, `actor_id`, `error_code`. Never bodies, headers, query strings, tokens, or `/c/<token>` paths (logged as `/c/[redacted]`). A unit test asserts a failing request with a token in the URL logs no token (PLAT-08 proof).

### Tests and the day-one spikes
- **D-21:** Vitest 5 with `projects` (`web` with jsdom, `worker` with `@cloudflare/vitest-plugin` 1.4.0). Spike first; if the Workers plugin does not work with Vitest 5 within 30 minutes, test Worker handlers with Hono's `app.request()` under plain Vitest and pin the plugin later. Playwright is added in Phase 3 when there are client flows to drive.
- **D-22:** Spikes to run in Phase 1 (each a short plan task with a written result in the plan summary, not production code): (a) Vitest 5 with the Workers plugin; (b) `@supabase/server` Hono adapter on `wrangler dev`; (c) a signed Supabase Storage upload (TUS) from an unauthenticated browser page, to de-risk Phase 3; (d) Cloudflare Email Service availability on this account versus Resend (no key exists for either; the result decides what Phase 2 can promise for REQ-04); (e) Truv sandbox `multiple.employments` order creation, only if Truv credentials are in the Worker secrets, otherwise record "blocked: no Truv keys"; (f) Logics scopes, `FileCategoryID`, and `ActivityType` values: this is a question for Andrew, recorded as an open item, not a code task.

### Claude's Discretion
- Exact shadcn component set, folder names under `app/src/features/`, Tailwind theme tokens (light default, dark toggle kept from shadcn-admin), icon set (Lucide), and the empty-dashboard copy.
- Hono middleware ordering, error envelope shape (`{ error: { code, message } }` is the suggestion), and request-id generation.
- Whether `app_migrations` tracking is a table or a comment convention, as long as `db-migrate.mjs` is idempotent.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Research (decisions already resolved)
- `.planning/research/SUMMARY.md` — resolved conflicts (engine port, licensing, token design, Plaid mode, polling), verified environment facts, demo path, suggested phase order
- `.planning/research/STACK.md` — exact package versions, Cloudflare Worker config, Vitest/Workers plugin rename, Supabase key deprecation, what not to use
- `.planning/research/ARCHITECTURE.md` — data model, write-through-Worker rule, client isolation, webhook framework, build order
- `.planning/research/PITFALLS.md` — C1 demo contamination, C2 link-as-auth, C3 RLS and service-role misuse, C12 PII in logs, C14 Workers limits

### Codebase maps
- `.planning/codebase/STACK.md` — existing toolchain and env var names
- `.planning/codebase/STRUCTURE.md` — where things live, naming, the `docs/` mirror convention
- `.planning/codebase/CONVENTIONS.md` — kebab-case files, named exports, type guards at boundaries, `ponytail:` shortcut comments, 500-line rule
- `.planning/codebase/CONCERNS.md` — the `.gitignore` bug, tracked `dist/`, no auth on the old API

### Existing contracts
- `src/schemas/database_schema.sql` — the 15 baseline tables already applied to Supabase; never drop or rename
- `src/questions.py` — the 32-question contract to reconcile against `question_definitions`
- `src/frontend/.env.example` and `.env.example` — env var names (values never printed)

### Rules
- `CLAUDE.md` (repo root) — TypeScript front end, 500-line limit, companion `docs/` Markdown per code file, Ponytail, open-source first
- `.agents/skills/supabase/SKILL.md` — Supabase security checklist (app_metadata not user_metadata, no service key in clients, RLS on every exposed table, security_invoker views)
- `.planning/Client/call1.md` — the ValorTax call; Andrew's wording is the acceptance test

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/frontend/src/questions.ts` and `src/frontend/src/flow.ts`: question declarations, applicability, validation, and currency formatting. Port into `app/src` in Phase 2 and Phase 7; do not rewrite the rules.
- `src/frontend/src/document-upload/requests.ts`: document-request derivation mirrored from `src/intake_workflow.py`; reuse in Phase 3.
- `src/frontend/src/supabase/client.ts` and `docs/src/frontend/src/supabase/client.md`: the env var names and the companion-doc format to copy.
- `src/schemas/database_schema.sql`: baseline tables and the `cases` / `case_financial_data` columns the engine expects.
- `.planning/codebase/TESTING.md`: Vitest + jsdom setup already proven in this repo.

### Established Patterns
- Type guards (`isX`) validate every API response at the boundary; keep this in the new SPA's API client.
- Named exports only, kebab-case filenames, tests co-located as `*.test.ts`, no default exports, no barrel files.
- Known shortcuts carry a `ponytail:` or `shortcut:` comment naming the limit and the upgrade trigger.
- Unknown is `null`, never `0`; required unknowns block rather than default.

### Integration Points
- Root `.gitignore` (merged-line bug) and `src/frontend/dist/` (tracked) are the first edits.
- Supabase project `zvkphuikjpwoauqdimcf`: 15 tables, standards seeded, 28 `question_definitions` rows, 0 auth users, 0 buckets.
- Cloudflare account "Zh@licom.ai's Account" authenticated for wrangler 4.149.0 via `npx -y dotenv-cli -- npx wrangler ...`.
- Root `.env` holds `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `CLOUDFLARE_API_TOKEN`; `src/frontend/.env` holds the Supabase URL and publishable key. No Logics, Plaid, Truv, DocuSeal, Smarty, Resend, or Supabase secret key is known to exist yet; the plan must list each as a `wrangler secret put` step for the user.

</code_context>

<specifics>
## Specific Ideas

- Andrew will join the Oct 12 demo as a case manager, so the SANDBOX banner and the Logics write guard are not optional polish; they are what makes it safe for him to click anything.
- The admin shell should feel like ERPNext-grade business software (sidebar, dense tables, status badges) built from shadcn-admin parts; the client pages should feel like a clean one-column mobile checklist. Copy patterns from ERPNext/DocuSeal/Bigcapital, copy code only from MIT sources.
- Keep the company name configurable (`firms.name` and a `VITE_APP_NAME` fallback) so white-labeling later is a data change.
- Preserve the Python engine and tests untouched; Phase 7 ports them with golden fixtures.

</specifics>

<deferred>
## Deferred Ideas

- Supabase Realtime for dashboard updates (v2; polling in v1).
- PostHog analytics on staff pages only (v2; never on `/c/*`).
- Custom domain for the Worker (post-demo polish).
- Staff MFA and the WISP evidence pack (Phase 8).
- Direct PostgREST reads from the SPA with staff policies (only if the Worker-only path becomes a bottleneck).
- Virus scanning service for uploads (v2).

</deferred>

---

*Phase: 01-foundation-staff-sign-in*
*Context gathered: 2026-10-10*
