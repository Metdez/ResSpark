# Walking Skeleton — ResSpark

**Phase:** 1
**Generated:** 2026-10-10

## Capability Proven End-to-End

> A ValorTax case manager opens `https://resspark.<subdomain>.workers.dev/admin`, signs in with a Supabase Auth email + password, lands in the admin shell under a SANDBOX banner, and that sign-in is recorded as a `staff.signed_in` row in `public.events` written by the Worker through `log_event()`; a refresh keeps them signed in, and the same URL with no session redirects to `/admin/sign-in`.

The skeleton path is the chain of `type="tracer"` tasks: 01-T1 (hygiene gate runs) → 02-T1 (forked SPA builds) → 03-T1 (Worker + SPA deployed, `smoke.mjs` green) → 04-T1 (migration `0002` applied through the Management API) → 05-T1 (Worker secrets provisioned, two staff users exist) → 06-T1/T2 (JWT-verified `POST /api/admin/session` writes the event; SPA sign-in, guard, and sign-out wired) → 07-T1 (`GET /c/:token` exchange). Every other task is a locked expansion from CONTEXT.md D-01..D-22 on top of that chain.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework (SPA) | React 19 + Vite 8 + TanStack Router 1.168 (file routes, `autoCodeSplitting`) + shadcn/ui `new-york`/`slate`, forked from `satnaing/shadcn-admin@e16c87f` (MIT) with Clerk/axios/faker/demo pages stripped (D-03) | 15.7k-star MIT admin shell already has sidebar, header, command palette, data-table, auth screens; ERPNext/DocuSeal/Bigcapital are visual references only (GPL/AGPL) |
| API runtime | Hono 4.13 on Cloudflare Workers, one Worker `resspark` serving static assets + `/api/*` + `/webhooks/*` + `/c/*` from one deploy via `@cloudflare/vite-plugin` (D-01, D-06) | One origin, no CORS, `run_worker_first` for the paths the Worker must answer; account is **Workers Free** (F-1): Queues/cron work, 10 ms CPU, Email Sending is Paid-only |
| Data layer | Existing Supabase project `zvkphuikjpwoauqdimcf` (Postgres 17.6); plain SQL migrations in `supabase/migrations/NNNN_*.sql` applied by `app/scripts/db-migrate.mjs` through `supabase db query --linked` (Management API, CLI login, no DB password) and tracked in `public.app_migrations` (D-09, D-10) | 15 baseline tables + 16,115 standards rows are already applied and are the engine's contract (one-way); `supabase db push` needs a password nobody has |
| Data path | Worker-only: the SPA never calls PostgREST for data; the Worker uses the `sb_secret_` key (`service_role`) per request; RLS enabled on every public table with `anon`/`authenticated` grants revoked and default privileges altered (D-12, D-15) | Deny-by-default is a database property; `rls.test.ts` proves 401 for every table |
| Auth | Supabase Auth email + password, sign-ups disabled, users created by `app/scripts/create-staff.mjs` with `app_metadata.{firm_id,role}`; Worker verifies ES256 JWTs with `jose` against the project JWKS (`iss=${SUPABASE_URL}/auth/v1`, `aud=authenticated`) and cross-checks `staff_profiles` (D-14, D-15, D-16) | Project already uses asymmetric signing keys (F-3); `@supabase/server` adapters are deprecated (removal 2026-12-01) |
| Client-link auth | `base64url(link_id(16) ‖ HMAC-SHA256(key, link_id ‖ be32(version)))`, exchanged by the Worker for a signed `HttpOnly; Secure; SameSite=Lax` cookie `rs_client` (24 h) and a 302 to `/c/`; uniform 404 on any failure; per-IP rate limit (D-17, D-18) | Token never reaches SPA code or logs; `version` makes rotation reversible |
| Event log | `public.events` (append-only trigger) written only via `log_event()` RPC (`SECURITY INVOKER`, EXECUTE revoked from anon/authenticated/public) by the Worker (D-11, D-16) | PLAT-04: one write path every later phase reuses |
| Logging | One allowlisted JSON logger (`request_id, route, method, status, duration_ms, firm_id, actor_id, error_code`), `routePath(c, -1)` never `c.req.path`, Workers invocation logs **off** (D-20) | PLAT-08: the platform would otherwise record `/c/<token>` URLs |
| Demo safety | Worker vars `APP_ENV`, `LOGICS_WRITE_ENABLED=false`, `LOGICS_TEST_CASE_IDS`; `logicsWriteGuard()` server-side; SANDBOX banner whenever `app_env !== "production"` (fail-safe while loading) (D-19) | Andrew clicks anything on demo day without touching the real Logics tenant |
| Deployment target | `https://resspark.<subdomain>.workers.dev` (free subdomain; custom domain deferred) | PLAT-01: a real public URL from day one |
| Package manager / repo | pnpm 10.32 workspace (`pnpm-workspace.yaml` → `app`), one root `pnpm-lock.yaml`, Node `>=22.12` with `engine-strict`, `src/frontend/` frozen as legacy, Python untouched (D-01, D-02, D-05) | PLAT-06 |
| Directory layout | `app/src/` (SPA: `routes/`, `features/`, `components/`, `lib/`, `styles/`), `app/worker/src/` (`index.ts`, `middleware/`, `auth/`, `db/`, `routes/`, `integrations/logics/`, `log/`), `app/worker/test/` (live/integration tests), `app/scripts/*.mjs`, `supabase/migrations/`, `docs/app/**` companion docs | Mirrors RESEARCH "Recommended Project Structure"; `db/` is the single firm-scoped data-access module |
| Tests | Vitest 5 `projects`: `web` (jsdom, `src/**`), `worker-node` (node, `worker/**` via Hono `app.request()` with an env object), optional `workerd` (`@cloudflare/vitest-plugin`, spike a) | Worker tests do not depend on the spike result |
| Email (Phase 2) | Resend over `fetch` (Cloudflare Email Sending is Paid-only and needs a Cloudflare-DNS domain); `RESEND_API_KEY` reserved as a secret name | Spike (d) resolved by research |

## Stack Touched in Phase 1

- [x] Project scaffold — pnpm workspace, forked SPA, Worker, `wrangler.jsonc`, Vitest projects, ESLint, `check-file-sizes.mjs`, `hygiene-check.sh`
- [x] Routing — `/admin/sign-in`, `/admin` (guarded shell + empty dashboard), `/admin/settings/appearance`, `/c/` placeholder, `/c/$token` SPA fallback; Worker routes `/api/config`, `/api/admin/session`, `GET /c/:token`, `/webhooks/*` → 404 JSON
- [x] Database — one real write (`log_event` → `events` on sign-in/sign-out; `firms` seed; `staff_profiles` via `create-staff.mjs`) AND one real read (`staff_profiles` lookup in `staffAuth`; `client_links` lookup in `verifyLinkToken`)
- [x] UI — sign-in form wired to Supabase Auth → Worker session event → admin shell; sign-out dialog → event → sign-out
- [x] Deployment — running on `*.workers.dev`; `app/scripts/smoke.mjs <url>` is the deployed full-stack check

## Out of Scope (Deferred to Later Slices)

- Logics lookup, request builder, client portal screens (Phase 2); uploads (Phase 3); Plaid/Truv (Phase 4); Logics push (Phase 5); address + e-sign (Phase 6); 433-A view (Phase 7); reminders, Teller, MFA, WISP (Phase 8)
- `requests`, `request_items`, `connections`, `connection_secrets`, `webhook_events`, `logics_pushes`, `consents` tables — later migrations
- Supabase Realtime, PostHog, custom domain, direct PostgREST reads from the SPA, virus scanning (CONTEXT.md Deferred Ideas)
- Workers Paid upgrade (surfaced as a user note, not performed)

## Subsequent Slice Plan

- Phase 2: Logics case lookup + request builder + copyable client link (`client_links` rows minted with `mintLinkToken`, Start tap marks `opened_at`)
- Phase 3: Signed TUS uploads to Supabase Storage, staff review, polling dashboard (`data-table`)
- Phase 4: Truv + Plaid connects, `/webhooks/:provider` on the same Worker, Queue consumer + cron reconciler
- Phase 5: Logics push behind `logicsWriteGuard`
- Phase 6: Smarty + DocuSeal
- Phase 7: 433-A pre-population (TS port of the Python engine; `src/frontend/` deleted)
- Phase 8: reminders (Resend), Teller, MFA, retention purge
