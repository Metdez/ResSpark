---
gsd_state_version: "1.0"
current_phase: 8
current_phase_name: Reminders & Readiness
status: paused
stopped_at: Phases 1-7 complete, verified, deployed 4219f2b; Phase 8 awaiting approval
last_updated: "2026-10-11T20:05:06.746Z"
last_activity: 2026-10-11
last_activity_desc: Phase 7 verified (66/71, live suites 39/39); Phase 8 awaiting "approve phase 8 migrations"
state_head: c62c76ecf5bbe2e2f5507446490e9caaf8dbb69e
progress:
  total_phases: 8
  completed_phases: 0
  total_plans: 67
  completed_plans: 55
  percent: 82
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-10)

**Core value:** A case manager can send a client one link and get bank statements, pay stubs, and documents back into the Logics case without chasing, babysitting, or re-uploading.
**Current focus:** Phase 8 — Reminders & Readiness (gated on approval)

## Current Position

Phase: 8 (Reminders & Readiness) — NOT STARTED, waits for "approve phase 8 migrations"
Plan: 0 of 12
Status: Phases 1–7 built, verified (human_needed) and deployed at 4219f2b
Last activity: 2026-10-11 — Phase 7 verified; live suites 39/39

Progress: [████████░░] 82% (55/67 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: - min
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 6 min | 2 tasks | 15 files |
| Phase 01 P02 | 34 min | 2 tasks | 158 files |
| Phase 01 P03 | 52min | 3 tasks | 43 files |
| Phase 01 P04 | 23min | 2 tasks | 13 files |
| Phase 01 P05 | 27 min | 3 tasks | 31 files |
| Phase 01 P08 | 9min | 2 tasks | 6 files |
| Phase 02 P01 | 10 min | 2 tasks | 7 files |
| Phase 01 P06 | 30 min | 3 tasks | 48 files |
| Phase 01 P07 | 30min | 3 tasks | 39 files |
| Phase 02 P03 | 29 min | 3 tasks | 29 files |
| Phase 02 P04 | 30 min | 3 tasks | 24 files |
| Phase 02 P05 | 29 min | 3 tasks | 38 files |
| Phase 02 P07 | 20 min | 2 tasks | 14 files |
| Phase 02 P06 | 27 min | 3 tasks | 27 files |
| Phase 02 P08 | 41 min | 3 tasks | 40 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Demo path is Phases 1-5 on sandbox providers and synthetic cases; Phase 6 (Smarty, DocuSeal) is nice-to-have; Phases 7-8 are "coming next"
- [Roadmap]: Engine is a mechanical TypeScript port with Python kept as the test oracle; no threshold or formula changes (Phase 7)
- [Roadmap]: HMAC-signed, stateful client link exchanged for an HttpOnly cookie; a GET never marks "opened" (Phase 2)
- [Roadmap]: Plaid Hosted Link opened from our own portal button, not Plaid-sent SMS; polling (5-10 s) instead of Realtime for status
- [Roadmap]: Copy code only from MIT/Apache repos; ERPNext, DocuSeal, Gather, Bigcapital are visual references only
- [Phase 01]: Workspace lockfile lives at the repo root (pnpm-lock.yaml); the one-lockfile gate asserts none exists under app/
- [Phase 01]: Added .gitattributes (*.sh text eol=lf) so hygiene-check.sh survives core.autocrlf=true checkouts
- [Phase 01]: check-file-sizes.mjs excludes only routeTree.gen.ts, worker-configuration.d.ts, and vendored src/components/ui/**; the 500-line limit is not configurable
- [Phase 01]: Fork versions pinned from shadcn-admin's lockfile at e16c87f (TanStack Router 1.168.22/plugin 1.167.22/devtools 1.166.13, Query 5.99.0, Table 8.21.3, TS 6.0.3) rather than registry latest
- [Phase 01]: jsdom pinned to 29.0.1 (30.x requires Node ^24.15; machine has 24.14 with engine-strict)
- [Phase 01]: react-top-loading-bar kept for navigation-progress; browser-mode tests, knip, and the font switcher dropped; @radix-ui/react-icons kept for data-table
- [Phase 01]: Byte-identical fork files indexed once in docs/app/src/VENDORED.md; one-line edits in its near-vendored table; other edited files get their own companion doc
- [Phase 01]: 01-03: Logics write allowlist is an exact trimmed-string match (no coercion/prefix); flag must be exactly 'true'
- [Phase 01]: 01-03: actor_id (Supabase user UUID) and error_code (fixed enum) are not PII and may be logged
- [Phase 01]: 01-03: api.ts imports @/lib/supabase lazily so the SPA boots without VITE_SUPABASE_* and public /api/config works
- [Phase 01]: 01-03: SANDBOX banner shell offset via unlayered CSS on data-slot; vendored sidebar/header untouched
- [Phase 01]: 01-04: rls.test.ts asserts strict 401+42501 per table (200 [] would hide leaked grants on empty tables)
- [Phase 01]: 01-04: log_event EXECUTE revoked from PUBLIC/anon/authenticated, granted explicitly to service_role; events.case_id nullable FK with no ON DELETE
- [Phase 01]: 01-04: question contract is 28 ids (reconciled 28=28); the 32 in CLAUDE.md/PROJECT.md is stale, pending user decision
- [Phase 01]: provision-secrets reads sb_secret_ with --reveal and accepts only the full key shape; CLIENT_LINK_HMAC_KEY is kept on re-run
- [Phase 01]: create-staff re-applies app_metadata on existing users; lib/dev-vars.mjs is the only writer of app/.dev.vars
- [Phase 01]: 01-08: Phase 3 uploads use Worker-minted createSignedUploadUrl + no-session publishable client: uploadToSignedUrl <=6 MiB, TUS on <ref>.storage.supabase.co/storage/v1/upload/resumable/sign with x-signature above (spike c PASS/PASS)
- [Phase 01]: 01-08: Phase 2 email via Resend over fetch; RESEND_API_KEY/MAIL_FROM reserved, not in secrets.required until a key exists (spike d)
- [Phase 02]: 02-01: requests carries contact_email/contact_phone_e164 (planner assumption beyond D-06) for D-09 email and LOOK-04 send-time check; awaiting user confirm
- [Phase 02]: 02-01: every request RPC locks requests then client_links; RAISE tokens are bare (no_items, case_not_found, request_not_found, request_not_draft, request_not_active, request_revoked, link_inactive)
- [Phase 02]: 02-01: live-test probe case Logics 999999001 is a permanent fixture (events FK + append-only block case deletes); admin case lists should filter it
- [Phase 01]: PLAT-07 assumption: refresh persistence = supabase-js localStorage + auto-refresh; a Worker 401 on /api/admin/* means signed out (local sign-out + redirect)
- [Phase 01]: GET /api/admin/session added so nav-user has display_name before Phase 2's /api/admin/me
- [Phase 01]: staffAuth takes firm/role from staff_profiles and 403s when app_metadata.firm_id disagrees; jwtVerify pins iss, aud and ES256
- [Phase 01]: Hygiene gate (h) matches sb_secret_ plus 16+ key chars; supabase-js ships the bare literal
- [Phase 01]: 01-07: Rate Limiting binding LINK_RATE_LIMITER accepted on deploy (A-1 held); in-memory window is fallback only
- [Phase 01]: 01-07: one root Toaster, top-center on /c and /c/*, top-right on admin
- [Phase 01]: 01-07: rs_client cookie = signed JSON {link_id, exp}, key = SHA-256(CLIENT_LINK_HMAC_KEY + ':cookie'); link tokens use the key's UTF-8 bytes
- [Phase 02]: 02-03: lookup sub-app (use('*', staffAuth)) is mounted last among /api/admin routes so siblings never re-verify the token
- [Phase 02]: 02-03: LOGICS_MODE/RESEND_FROM/INTEGRATION_ENC_KEY declared in Task 1 so tsc stays green; LogicsEnv is now Pick<Env, ...>
- [Phase 02]: 02-03: assumption-delta for the staff-selected Logics case identity is no-change (explicit confirm step by design)
- [Phase 02]: Send: one keep_flagged acknowledgement covers both the did-you-mean and differs-from-Logics flags; contact_overridden records only a kept flagged value
- [Phase 02]: requests.contact_email/contact_phone_e164 hold the validated checkContact output; the email action reads no body and sends only to contact_email
- [Phase 02]: staffAuth is idempotent (skips when c.var.staff is set) so sub-apps sharing /api/admin/requests verify the token once
- [Phase 02]: 02-05: Feature components are router-free with navigation callbacks; ApiError.body (additive) carries refusal extras through the single api() boundary; unlessHandled forwards unhandled mutation errors to the app default handler
- [Phase 02]: 02-07: CSRF guard for the client portal is X-Requested-With: ResSpark on every POST /api/c/* (403 bad_origin), on top of the SameSite=Lax cookie
- [Phase 02]: 02-07: One 401 no_session body for every client-session failure; identity comes only from the signed rs_client cookie and the link row is re-read on every call
- [Phase 02]: 02-07: Heartbeat limit is an in-memory per-isolate window (hb:<link>, 10 per 60 s) marked shortcut:, upgrade to a Rate Limiting binding keyed by link
- [Phase 02]: 02-07: PortalState allow-list is firm_name, agent_display_name, status, opened_at, expires_at, steps[id, position, kind, label, required, status]
- [Phase 02]: Link actions reuse the house ConfirmDialog; revoke confirm is destructive via its destructive prop
- [Phase 02]: Request page prefers the stored link once it exists so regenerate/revoke refetches show current state
- [Phase 02]: Saving Logics credentials replaces the cached status with the PUT answer instead of refetching
- [Phase 02]: Populated requests list follows dense-table rules with count-aware caption; filters/sorting/polling stay Phase 3 (assumption for Phase 3 to confirm)
- [Phase 02]: 02-08: app-wide error toast fires only on /admin; queries that render their own error set meta.errorShown and pass only a 401
- [Phase 02]: 02-08: client heartbeat runs from state load with last_step intro/list/step kind; PORT-04 saved progress is server-side status and opened_at

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 1]: Demo is Mon Oct 12 2026 11:30; Andrew joins from his dad's office and acts as a case manager
- [Phase 1]: Supabase 0001 baseline is already applied (15 tables, standards seeded); migrations must be additive only
- [Phase 1]: question_definitions has 28 rows but CLAUDE.md and PROJECT.md say 32; reconcile before wiring intake to the database
- [Phase 2]: Logics key scopes, FileCategoryID list, and ActivityType values are unknown; ask Andrew before Phase 2 ends
- [Phase 4]: Plaid Statements and Chase coverage, Truv multi-employer behavior, and live webhook signing need research before planning
- [Phase 6]: Which forms may be e-signed needs ValorTax counsel input; official 433-A is not signed in the portal
- [Phase 7]: Interview Nicole and Sandra on 433-A layout and which of 433-A, 433-F, OIC ValorTax uses most
- [Requirements]: REQUIREMENTS.md header said 62 v1 requirements; the actual count is 70 and has been corrected
- app/.env not created in Plan 01-02 (auto-mode classifier blocked the copy); human must copy src/frontend/.env to app/.env and append VITE_APP_NAME=ResSpark before Plan 06 needs Supabase in the SPA
- USER ACTION (01-05): run pnpm -C app run deploy then node app/scripts/smoke.mjs https://resspark.zh-a16.workers.dev (deploy with secrets.required was blocked by the auto-mode classifier)

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

## Session Continuity

Last session: 2026-10-11T20:05:05.603Z
Stopped at: Phases 1-7 complete, verified, deployed 4219f2b; Phase 8 awaiting approval
Resume file: .planning/HANDOFF.md
