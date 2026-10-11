# Phase 2: Find the Client & Send the Link - Context

**Gathered:** 2026-10-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 2 delivers the first real staff workflow and the first real client screen on the Phase 1 foundation: a firm admin pastes the firm's Logics API credentials and tests them; staff look up a Logics case by case ID, phone, or email, confirm the right person, build a request from a seeded template, and get a copyable, expiring, revocable client link (optionally emailed); the client opens the link on a phone, sees the firm and agent names and a step list, taps Start (which marks the request opened), and can close and resume. Requirements: LOOK-01..05, REQ-01..05, PORT-01..06. Uploads, approve/reject, dashboard status, and provider connects are Phases 3 and 4; the step list in this phase shows the steps with their state but only the Start interaction is live.

</domain>

<decisions>
## Implementation Decisions

Discussion ran in `--auto` mode (non-interactive session). Each decision is the recommended option given PROJECT.md ("What Andrew asked for"), the research, and the Phase 1 plans. Override here before planning if needed.

### Logics credentials and client
- **D-01:** Firm-level Logics credentials live in a new `firm_integrations` table (`firm_id`, `provider` = `logics`, `base_url`, `api_key_ciphertext`, `secret_ciphertext`, `key_hint` = last 4 of the API key, `last_test_at`, `last_test_ok`, `updated_by`). Values are AES-GCM encrypted in the Worker with a new secret `INTEGRATION_ENC_KEY` (32 bytes, provisioned by `app/scripts/provision-secrets.mjs` alongside the Phase 1 secrets) and decrypted only inside the Worker. The Settings page shows the key hint and "Updated {date}", never the full values again. — **Reversibility:** costly — ciphertext format is tied to the key; rotating means re-encrypting rows.
- **D-02:** `app/worker/src/integrations/logics/client.ts` is a plain `fetch` client: Basic auth `base64(apiKey:secretToken)`, base URL `https://valortax.logiqsapi.com/publicapi/V4/` by default (editable per firm), and the Find/CaseInfo endpoints take their parameters as **HTTP headers** (`phone`, `email`, `lastName`, `CaseID`), not query strings (per `Logics_API_Documentation.docx.md`). Every call goes through the Phase 1 `logicsWriteGuard` for writes; Phase 2 only reads. The client never logs request headers.
- **D-03:** "Test connection" calls `GET Find/FindCaseByEmail` with the signed-in admin's own email and treats HTTP 200 (any `data`) as success and 401/403 as "credentials rejected"; the result and timestamp are stored on `firm_integrations` and an event `integration.logics.tested` is logged. Lookup routes return a clear "Logics is not configured" error until a successful test exists (LOOK-05).
- **D-04:** Phone normalization: strip to digits, drop a leading `1` on 11-digit numbers, require 10 digits; store `phone_e164` (`+1##########`). When calling Logics Find-by-phone, try the digits-only form first and, if it returns an empty list, retry once with `(###)###-####` (the doc's sample format). `shortcut:` Logics' accepted phone format is undocumented; remove the retry once Andrew confirms the format.
- **D-05:** Lookup results are shown as a list of confirm cards (name, masked phone, email, Logics status id, created date). Staff must click "Yes, this is the client" on exactly one card before the request builder appears; the chosen case is upserted into `cases` (extended with `logics_case_id`, `logics_snapshot jsonb`, `logics_fetched_at`, `first_name`, `last_name`, `email`, `phone_e164`) and the event `case.looked_up` is logged with the search type (never the raw search value in logs). At send time the Worker re-fetches `Case/CaseInfo` and refuses to send if the name or contact changed (LOOK-04).

### Request builder and link
- **D-06:** Templates are seeded data: `request_templates` (`firm_id` nullable for global, `name`, `items jsonb`) with two seeds: "Standard resolution packet" (bank connection, payroll connection, address confirmation, government ID upload, engagement letter signature) and "Documents only" (ID upload, last 3 bank statements upload, last 2 pay stubs upload). `requests` (`id`, `firm_id`, `case_id`, `template_name`, `status` in draft|sent|opened|in_progress|waiting_on_staff|complete|revoked, `sent_at`, `opened_at`, `completed_at`, `created_by`, `agent_display_name`) and `request_items` (`request_id`, `position`, `kind` in bank_connect|payroll_connect|address|upload|signature|intake, `label`, `required`, `status` in pending|in_progress|submitted|approved|rejected, `config jsonb`, `rejection_note`). Staff can toggle items on/off and edit labels before send; no free-form template editor in v1.
- **D-07:** Contact validation is shared Zod 4 schema code in `app/src/lib/contact.ts` used by both the SPA form and the Worker: email syntax, phone 10 digits, and a 20-line typo-domain check with "did you mean" suggestions for the top consumer domains (gmail, yahoo, outlook, hotmail, icloud, aol, comcast). The send button is disabled until both pass or the staff member explicitly keeps a flagged value.
- **D-08:** Send creates the `client_links` row for the request (`request_id` becomes NOT NULL via the Phase 2 migration), mints the token with the Phase 1 primitives, sets `requests.status = sent`, logs `request.sent`, and returns the full URL. The request page shows the URL with a one-click Copy, a "Regenerate" (bumps `version`, old links 404) and a "Revoke" (sets `revoked_at`, status `revoked`) action, and the expiry date (14 days default).
- **D-09:** Email is best-effort through Resend over `fetch` (`RESEND_API_KEY` secret; sender from `RESEND_FROM`, default `onboarding@resend.dev` which only delivers to the Resend account owner during the demo). If the key is missing or the send fails, the UI shows "Email not configured — copy the link and send it yourself" and still records `request.link_copied` when Copy is clicked. Sending by text is a copy action; a "Client agreed to be texted" checkbox writes `consent.sms` to the event log with the agent id (REQ-05). No automated SMS.

### Client portal
- **D-10:** `GET /api/c/state` (cookie session from Phase 1) returns the request's firm name, agent display name, step list (`request_items` with status), `opened_at`, and expiry. The SPA `/c/` route renders the step list from it; before Start it shows the intro ("{Agent} at {Firm} needs a few things from you") with a single Start button. Start calls `POST /api/c/start` which sets `client_links.opened_at` and `requests.status = opened` and logs `request.opened` (PORT-02). Reopening the link later goes straight to the step list (PORT-04).
- **D-11:** Steps render as a one-column checklist with 44 px rows, each with a status chip (not started / in progress / done / needs attention) and a short plain-language description; only Start and "View" are interactive in Phase 2 (each step opens a placeholder "Coming next" sheet except the step list itself). Step order comes from `request_items.position`. Copy follows the UI-SPEC voice ("agent", "link", "bank").
- **D-12:** Client heartbeat is introduced now so Phase 3's mirror view has data: `POST /api/c/heartbeat` every 30 s while the tab is visible and on every step change, upserting `client_sessions` (`link_id`, `last_step`, `last_error`, `user_agent_class`, `seen_at`). Rate-limited per link.
- **D-13:** Expired/revoked/unknown tokens already 404 at the Worker (Phase 1). The SPA `/c/` route with no valid cookie shows the "ask your agent for a new link" page (PORT-06). No analytics on `/c/*`; `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, `X-Robots-Tag: noindex` headers also apply to `/api/c/*` responses.

### Data and routes
- **D-14:** Migration `supabase/migrations/0003_requests.sql` adds `firm_integrations`, `request_templates`, `requests`, `request_items`, `client_sessions`, the `cases` columns above, `client_links.request_id NOT NULL` (after backfill of zero rows), RLS enabled, grants revoked, and RPCs `request_send(...)` and `request_open(...)` that change state and insert the event in one transaction. Applied with `app/scripts/db-migrate.mjs`.
- **D-15:** Worker routes: `/api/admin/integrations/logics` (GET status, PUT credentials, POST test), `/api/admin/lookup` (POST {type, value}), `/api/admin/cases/:id/confirm`, `/api/admin/requests` (POST create from template, GET list), `/api/admin/requests/:id` (GET, POST send, POST regenerate, POST revoke, POST email, POST consent), `/api/c/state`, `/api/c/start`, `/api/c/heartbeat`. All admin routes use the Phase 1 `staffAuth` middleware and the firm-scoped `db/` module; all `/api/c/*` routes use a `clientSession` middleware that resolves the link from the cookie and never trusts a request id from the body.
- **D-16:** SPA features: `features/settings/integrations` (Logics form + Test connection), `features/lookup` (search form + confirm cards), `features/requests` (builder, request page with link actions), `features/client-portal` (intro, step list, placeholder sheets). Reuse shadcn-admin's form, card, badge, sheet, and data-table components; no new UI libraries.

### Claude's Discretion
- Exact typo-domain list and suggestion heuristic (Levenshtein 1 against the known list is enough).
- Request page layout details within the UI-SPEC tokens.
- Whether the lookup form is one input with auto-detected type or three tabs (one input with auto-detect is the suggestion: digits → phone, `@` → email, else case id).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 1 foundation (build on it, do not re-create)
- `.planning/phases/01-foundation-staff-sign-in/01-CONTEXT.md` — D-01..D-22 (layout, Worker-only data path, token/cookie primitives, logger, demo safety)
- `.planning/phases/01-foundation-staff-sign-in/01-SKELETON.md` — directory layout, route list, test projects
- `.planning/phases/01-foundation-staff-sign-in/01-0[1-8]-PLAN.md` — the files Phase 1 creates (`app/worker/src/{index,auth/client-link,auth/staff-jwt,middleware/staff-auth,db/*,routes/*,log/logger,integrations/logics/write-guard}.ts`, `app/src/routes/{admin,c}/**`, `app/scripts/*.mjs`, `supabase/migrations/0002_platform_foundation.sql`)
- `.planning/phases/01-foundation-staff-sign-in/01-UI-SPEC.md` — design system of record; status-badge palette and Inherited conventions apply to every Phase 2 screen

### Integration contracts
- `Logics_API_Documentation.docx.md` — auth guide, `Find/FindCaseByPhone`, `Find/FindCaseByEmail`, `Find/FindCase`, `Case/CaseInfo` (header parameters), response shapes
- `.planning/research/PITFALLS.md` — C2 (link as auth), C8 (wrong-client send), M1, M2, M6
- `.planning/research/ARCHITECTURE.md` — request/link data model, client isolation rule
- `.planning/PROJECT.md` — "What Andrew asked for, in his words" (acceptance wording)

### Rules
- `CLAUDE.md`, `.claude/CLAUDE.md`, `.agents/skills/supabase/SKILL.md`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 1: `logicsWriteGuard`, `logEvent`, `db/client` firm-scoped module, `verifyLinkToken`/`mintLinkToken`, `clientSession` cookie helpers, `staffAuth` middleware, allowlisted logger, `check-file-sizes.mjs`, `db-migrate.mjs`, `provision-secrets.mjs`.
- `src/frontend/src/document-upload/requests.ts` and `src/intake_workflow.py` `_REQUESTS`: the document-request labels and codes to reuse for template item labels.
- shadcn-admin: `data-table`, `form`, `card`, `badge`, `sheet`, `command` components already in `app/src/components/`.

### Established Patterns
- Every mutation goes through a Worker route into an RPC that writes the event in the same transaction.
- Type guards at the SPA API boundary; named exports; kebab-case files; companion docs under `docs/`.

### Integration Points
- `app/worker/src/index.ts` route registration; `app/src/routes/admin/_shell/*` for new admin pages; `app/src/routes/c/index.tsx` for the client step list; `app/src/components/layout/data/sidebar-data.ts` for nav entries (Lookup, Requests, Settings → Integrations).

</code_context>

<specifics>
## Specific Ideas

- Andrew's acceptance wording: "type in the case ID or search for the name... it pops up this person's name, their phone, their email... is this the person? Yes"; "a link that an agent could copy"; "errorified" email/phone; "are you on this step?".
- Demo: the lookup must work against a fake/test Logics case or a recorded fixture when credentials are not yet provided; include a `LOGICS_MODE=fake` Worker var that serves fixture cases from `app/worker/src/integrations/logics/fixtures.ts` so the Oct 12 demo runs end to end without real credentials.

</specifics>

<deferred>
## Deferred Ideas

- Free-form template editor (v1.x); dashboard list with filters and live status (Phase 3); uploads, approve/reject (Phase 3); provider connects (Phase 4); automated SMS (out of scope); Smarty address step (Phase 6).

</deferred>

---

*Phase: 02-find-the-client-send-the-link*
*Context gathered: 2026-10-10*
