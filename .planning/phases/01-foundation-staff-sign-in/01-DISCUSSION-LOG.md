# Phase 1: Foundation & Staff Sign-In - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-10
**Phase:** 1-Foundation & Staff Sign-In
**Mode:** `--auto` (non-interactive session; recommended options auto-selected and logged)
**Areas discussed:** Repo layout and toolchain, Hosting and deploy, Data and migrations, Staff auth and data path, Client-link primitives, Demo safety and logging, Tests and spikes

---

## Repo layout and toolchain

| Option | Description | Selected |
|--------|-------------|----------|
| New `app/` as one Vite project (SPA + worker) | Matches STACK.md; old `src/frontend` frozen until Phase 7 | ✓ |
| Replace `src/frontend/` in place | Keeps the path, but deletes working intake code before Phase 7 reuses it | |
| pnpm monorepo (`apps/web`, `apps/worker`, `packages/shared`) | More structure than a one-Worker deploy needs | |

**Auto choice:** New `app/` directory, pnpm, shadcn-admin fork with Clerk/axios/faker stripped, TanStack Table pinned to v8, TypeScript ~6.0.3.
**Notes:** `[auto] Repo layout — Q: "Where does the new app live?" → Selected: "New app/ as one Vite project" (recommended default)`

---

## Hosting and deploy

| Option | Description | Selected |
|--------|-------------|----------|
| One Worker with static assets, `*.workers.dev`, queue + DLQ + cron | Single deploy, webhooks on a public URL from day one | ✓ |
| Cloudflare Pages for SPA + separate Worker for API | Two deploys, two configs | |
| Supabase Edge Functions for the API | Second deploy pipeline needing the Supabase CLI login | |

**Auto choice:** One Worker; queue only if the account is on Workers Paid, otherwise inline + cron with an upgrade note.
**Notes:** `[auto] Hosting — Q: "SPA and API deploy shape?" → Selected: "One Worker with static assets" (recommended default)`

---

## Data and migrations

| Option | Description | Selected |
|--------|-------------|----------|
| Additive SQL migration files applied via `supabase db query --linked -f`, tracked in `app_migrations` | Works without the DB password; keeps the 15 baseline tables | ✓ |
| `supabase db push` | Needs the database password, which is not available | |
| Drizzle ORM migrations | Adds an ORM nobody asked for | |

**Auto choice:** SQL files + `db-migrate.mjs`; RLS on with no anon/authenticated policies; Worker-only data path; reconcile 28 vs 32 questions additively.
**Notes:** `[auto] Migrations — Q: "How are schema changes applied?" → Selected: "SQL files via Management API" (recommended default)`; `[auto] RLS proof — Q: "pgTAP or live integration test?" → Selected: "Vitest integration test against PostgREST" (no Docker dependency)`

---

## Staff auth and data path

| Option | Description | Selected |
|--------|-------------|----------|
| Email + password, admin-created users, Bearer token to Worker | Reliable for the demo; no email rate limits | ✓ |
| Magic link | Depends on Supabase built-in email limits during a live demo | |
| Worker-managed cookie session for staff | Re-implements what Supabase Auth already provides | |

**Auto choice:** Email + password; `app_metadata.firm_id` and `role`; all reads and writes through the Worker.
**Notes:** `[auto] Staff auth — Q: "Sign-in method?" → Selected: "Email + password" (recommended default)`; `[auto] Data path — Q: "Direct PostgREST reads or Worker-only?" → Selected: "Worker-only in v1" (fewer policies to get wrong before the demo)`

---

## Client-link primitives

| Option | Description | Selected |
|--------|-------------|----------|
| HMAC-signed re-derivable token + HttpOnly cookie exchange | Staff can re-copy the link; GET never marks opened | ✓ |
| Random token stored as a hash | Cannot be re-copied by staff | |
| Supabase anonymous sign-in for clients | Gives clients a database identity the design avoids | |

**Auto choice:** HMAC token (research decision), 14-day expiry, `version` for regeneration, `rs_client` cookie 24 h, rate-limited guessing.
**Notes:** `[auto] Token — Q: "Token design?" → Selected: "HMAC-signed, stateful" (locked in SUMMARY.md)`

---

## Demo safety and logging

| Option | Description | Selected |
|--------|-------------|----------|
| `APP_ENV` banner + `LOGICS_WRITE_ENABLED` + allowlist guard + allowlisted logger | Protects the real ValorTax tenant while Andrew clicks around | ✓ |
| Rely on sandbox credentials only | Logics has no sandbox | |

**Auto choice:** All four, shipped in Phase 1 with unit tests.
**Notes:** `[auto] Demo safety — Q: "How do we make the demo safe?" → Selected: "Flags + guard + banner + logger allowlist" (recommended default)`

---

## Tests and spikes

| Option | Description | Selected |
|--------|-------------|----------|
| Vitest 5 projects + Workers plugin spike, fallback to `app.request()` | Keeps one test runner | ✓ |
| Pin Vitest 4.1 to match Cloudflare docs | Diverges from the repo's Vitest 5 | |

**Auto choice:** Vitest 5 with the spike; six day-one spikes recorded as plan tasks with written results.
**Notes:** `[auto] Tests — Q: "Test runner?" → Selected: "Vitest 5 + Workers plugin spike" (recommended default)`

---

## Claude's Discretion

- Component set, folder names under `app/src/features/`, theme tokens, icon set, empty-dashboard copy
- Hono middleware order, error envelope, request-id generation
- `app_migrations` tracking shape

## Deferred Ideas

- Supabase Realtime (v2), PostHog on staff pages (v2), custom domain (post-demo), MFA and WISP pack (Phase 8), direct PostgREST reads (only if needed), virus scanning (v2)
