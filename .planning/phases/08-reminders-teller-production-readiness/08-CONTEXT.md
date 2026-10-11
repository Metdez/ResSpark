# Phase 8: Reminders, Teller & Production Readiness - Context

**Gathered:** 2026-10-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 8 takes the platform from demo to live ValorTax cases. It adds:

- capped email reminders that stop on their own, and a "stuck client" alert
- an identity gate on the client link (date of birth or last 4 of phone), on by default
- Teller as a second bank provider behind the Phase 4 `BankProvider`, transactions only, chosen by one setting
- staff MFA enforced through Supabase TOTP (AAL2)
- a generated WISP evidence pack
- a retention purge (default 2 years) that keeps the audit record
- AI document classification that runs on redacted text with zero-data-retention routing; its suggestions take effect only when staff confirm them
- one use-of-data statement shared by Plaid/Truv production access, the consent screens and a privacy page

Requirements: REM-01..04, PROD-01..04. Out of scope: own SMS, Logics notes per reminder, a pen test, an accessibility audit, and OCR/vision AI. Nothing here may break the Phases 1-5 demo path.

</domain>

<decisions>
## Implementation Decisions

Discussion ran in `--auto` mode. `[auto] Selected all gray areas: reminder cadence/storage, stuck alert, identity gate, Teller switch, staff MFA, WISP pack, retention purge, AI classification, production wording, migration number.` Each decision below is the recommended option, followed by a one-line *Why*. The Phase 6 and 7 CONTEXT files did not exist yet, so ROADMAP's migration numbers `0007` and `0008` are assumed for them. Override anything here before planning.

**Carried forward (do not re-decide):**

- The Worker is the only data path, scoped by `firm_id`. The logger is allowlisted.
- `rs_client` is a signed 24 h cookie, `{ link_id, exp }`, set by `GET /c/:token`. `clientSession` trusts only that cookie, plus `X-Requested-With: ResSpark` on POSTs.
- Email goes through Cloudflare Email Service (`EMAIL` binding, `email/cloudflare-email.ts`). *Updated 2026-10-11: this replaced Resend.*
- `client_sessions` records heartbeats.
- Every mutation goes through an RPC that writes its own event.
- `request_status()`, `request_dashboard_v`, and 5 s polling stay as they are.
- `BankProvider` exposes capabilities; `PROVIDER_CAPABILITIES.teller = { transactions: true, statementPdfs: false, hostedLink: false }`.
- Webhooks arrive on `/api/webhooks/:provider` and go through the queue, with a DLQ.
- `cron.ts` runs `reconcileTick` on `*/15` and `dailyJobs` at `0 3 * * *`.
- `connection_secrets` are AES-GCM encrypted. Consents carry `text_version`.
- Logics fake mode and the Logics write guard stay as they are.

### Reminders (REM-01)

- **D-01: Settings and storage.**
  - All Phase 8 settings live in `firms.settings`, behind one Zod `FirmSettings` schema with defaults in `app/worker/src/db/firm-settings.ts`.
  - Reminder defaults are `{ enabled: true, cadence_days: [1, 3, 7], send_hours: [9, 18], timezone: "America/New_York" }`.
  - `cadence_days` holds 1-3 rising entries of 1-30 days each, counted from `sent_at`.
  - New `requests` columns: `reminders_enabled`, `reminder_count` (check 0-3), `next_reminder_at`, `last_reminder_at`.
  - *Why:* this is the Gather/TaxDome pattern, and the schedule state survives deploys.
- **D-02: When a reminder is due.** `reminderTick` (every 15 minutes) calls `reminders_due(50)`. A request is due when all of these hold:
  - its status is sent, opened or in_progress
  - its link is live and reminders are enabled for it
  - the count is still under the cadence length
  - `next_reminder_at` has passed
  - the local hour is inside `send_hours`

  Reminders stop at `complete`, `revoked`, link expiry, or `waiting_on_staff`. If the client made progress in the last 24 h, the next reminder moves back 24 h instead of sending. *Why:* this is REM-01's stop rule, and a client who is acting is not "quiet".
- **D-03: Sending at most once.**
  - `send_reminder` first runs `reminder_claim(request_id, expected_count)`, a state-guarded increment.
  - It then sends through `email/cloudflare-email.ts` (was `email/resend.ts`) and logs `reminder.sent {n}` or `reminder.failed`. A claimed reminder is never re-sent.
  - With no `EMAIL_FROM` (no onboarded sending domain), the step does nothing and Settings shows "Reminders paused: email not configured".
  - *Why:* a missed reminder costs less than duplicate emails.
- **D-04: Templates and controls.**
  - There are 3 fixed email templates in `app/worker/src/reminders/templates.ts`. The copy is written ahead of time, not by AI.
  - Each template includes the firm, the agent, the re-derived link and its expiry, with `Reply-To` set to the agent.
  - The third template says "your agent will call you".
  - The request page shows "Reminders: 1 of 3 sent · next Tue 9:00" and a "Stop reminders" switch, which logs `request.reminders_paused`.
  - *Why:* this addresses Andrew's chasing pain without TCPA exposure.

### Stuck-client alert (REM-02)

- **D-05: Detecting and showing a stuck client.**
  - The `events_after_insert` trigger sets `requests.last_client_progress_at` on client and provider events. Heartbeats are not events, so they never count.
  - `request_dashboard_v` gains `is_stuck` and `stuck_hours`: a request is stuck when it is opened or in progress with no progress for `stuck_after_hours` (default 24, allowed 1-168).
  - Staff see a red "Stuck {N}h" badge, a "Needs a call" filter chip with a count, a count on the sidebar Dashboard item, and "No progress for {N} hours. Call the client." on the mirror card.
  - The alert is in-app only, separate from Phase 3's 10-minute hint.
  - *Why:* staff need to see it, and computing it in the view needs no cron.

### Identity gate (REM-04)

- **D-06: Stored digests.** At send, the Phase 2 `Case/CaseInfo` re-fetch stores two digests:
  - `gate_dob_digest`: HMAC-SHA256 of `"dob:" + YYYY-MM-DD`, parsed from Logics `DOB` (`MM/dd/yyyy`).
  - `gate_phone4_digest`: the same HMAC over the last 4 digits of `phone_e164`.

  The key is `HMAC(CLIENT_LINK_HMAC_KEY, "identity-gate-v1")`, so no new secret is needed and the DOB itself is never stored. `requests.identity_gate` defaults to the firm setting `identity_gate_default: true`. Staff can turn it off per request (`request.gate_disabled`). If neither digest exists, the gate is forced off with a warning. — **Reversibility:** costly — a new digest scheme invalidates every open request's gate.
- **D-07: Gate and session.**
  - The cookie exchange is unchanged. On a pass, the Worker re-issues `rs_client` as `{ link_id, exp, gate: 1 }` with the same `exp`.
  - `requireGatePassed` guards every `/api/c/*` route except `GET /api/c/state` and `POST /api/c/verify`.
  - Until the client passes, `/api/c/state` returns only `{ gate: "required", firm_name, agent_display_name, methods }`.
  - Start comes after the gate, and the client re-verifies whenever the 24 h cookie lapses.
  - *Why:* no new session store is needed.
- **D-08: Verification, lockout and UI.**
  - `POST /api/c/verify { method: "dob"|"phone4", value }` compares the digest with `timingSafeEqual`.
  - `gate_attempt` counts `client_links.gate_failures`. At 5 failures it sets `gate_locked_at` and shows "Too many tries. Ask {agent} for a new link."
  - Regenerating the link resets the count. The per-IP rate limit stays.
  - Events `client.gate_passed`, `client.gate_failed` and `client.gate_locked` never carry the entered value.
  - The UI is a masked numeric `MM/DD/YYYY` field (no date picker), a "Use the last 4 digits of your phone instead" option, the number of tries left, and 44 px targets.
  - *Why:* FEATURES recommends a DOB gate with a 5-try lock, and the phone fallback helps seniors.

### Teller second provider (REM-03)

- **D-09: Teller provider.** `integrations/bank/teller/{client,connect,transactions,index}.ts` export `tellerProvider`, and `bankProvider()` maps `teller` to it.
  - It calls `GET /accounts`, then `GET /accounts/{id}/transactions` for 180 days, paged by `count`/`from_id`, into `bank_transactions`. The sign flip has a fixture test.
  - `listStatements` returns `{ supported: false }`, so the statement grid shows `not_supported` with a manual upload.
  - `removeConnection` calls `DELETE /accounts`, which ends billing, and the daily removal covers Teller.
  - *Why:* reusing the Phase 4 contract is what makes it one switch.
- **D-10: The one switch.**
  - An admin chooses the firm setting `bank_provider: "plaid"|"teller"` with a radio in Settings → Integrations.
  - A provider that is missing its secrets or certificate is shown disabled, with the reason.
  - When the setting is unset, it falls back to `env.BANK_PROVIDER`.
  - New connections use the setting. Existing connections keep their own `connections.provider`.
  - The UI reads only `capabilities`.
  - *Why:* ROADMAP says staff switch it, and staff cannot edit Wrangler vars.
- **D-11: mTLS and Teller Connect.**
  - Add `mtls_certificates: [{ binding: "TELLER_CERT", certificate_id }]` to `wrangler.jsonc`, after `wrangler mtls-certificate upload`.
  - Every Teller call uses `env.TELLER_CERT.fetch`. Plain `fetch` is allowed only in sandbox when the binding is absent. The access token is the Basic-auth user.
  - The bank step loads `https://cdn.teller.io/connect/connect.js` through a typed `useScript` and calls `TellerConnect.setup({ applicationId, environment, products: ["transactions"], nonce })`. The server mints the nonce and stores it in `return_nonce`.
  - `onSuccess` posts to `POST /api/c/connections/:id/teller-complete`. The Worker verifies the ED25519 signature over `nonce.accessToken.userId.enrollmentId.environment` with `TELLER_TOKEN_SIGNING_KEY` before encrypting the token into `connection_secrets`.
  - Add the Teller hosts to the `/c/*` CSP.
  - Spike the binding on the real account first; there is a report of an empty 500.
  - *Why:* Teller requires mTLS in development and production, and the signature check blocks injected tokens.
- **D-12: Teller webhooks.** `webhooks/teller.ts` joins `/api/webhooks/:provider`.
  - It parses `Teller-Signature: t=..,v1=..` and checks HMAC-SHA256 of `` `${t}.${rawBody}` `` with `TELLER_SIGNING_SECRET` against any `v1`. It rejects `t` older than 3 minutes.
  - The event key is the webhook `id`.
  - `enrollment.disconnected` sets the connection to `error`. `transactions.processed` triggers a reconcile. `webhook.test` does nothing.

### Staff MFA and WISP evidence (PROD-02)

- **D-13: MFA enrollment and verification.** After the password step, the SPA checks `mfa.getAuthenticatorAssuranceLevel()`.
  - With no factor, it routes to `/admin/mfa/enroll`: show the QR SVG from `mfa.enroll({ factorType: "totp" })` with the secret as text, then a 6-digit `InputOTP` and `mfa.challengeAndVerify`.
  - With a factor at `aal1`, it routes to `/admin/mfa/verify`.
  - Copy shadcn-admin's `src/features/auth/otp` and the Supabase docs' EnrollMFA/AuthMFA shape. These are auth-only supabase-js calls (P1 D-15).
  - *Why:* it is free, built in, and `input-otp` is already installed.
- **D-14: Enforcement.**
  - `staffAuth` requires `aal === "aal2"` on every `/api/admin/*` route except `/api/admin/session`; otherwise it returns 401 `mfa_required`.
  - Log the events `staff.mfa_enrolled` and `staff.mfa_verified`.
  - There is no switch to turn MFA off.
  - A lost device is handled by `app/scripts/reset-staff-mfa.mjs <email>`, which calls admin `deleteFactor` and logs `staff.mfa_reset`.
  - `smoke --auth` keeps working with `DEMO_STAFF_TOTP_SECRET` in `.dev.vars` and a roughly 20-line RFC 6238 helper, `app/scripts/lib/totp.mjs`.
  - *Why:* 16 CFR 314.4(c)(5).
- **D-15: Evidence pack.** The admin page `/admin/settings/security` calls `GET /api/admin/compliance/evidence?from&to`, which returns one generated Markdown file; `?format=csv` returns the full access log. The pack contains:
  - staff and their MFA status
  - an access summary from `events`: sign-ins, `document.viewed`, downloads, approvals, pushes
  - key names and `key_version` counts, never key values
  - retention settings, recent purges and provider removals
  - static sections from `docs/compliance/{subprocessors,data-flow,incident-runbook,use-of-data}.md`, including the 30-day FTC notice for 500+ affected people and the IRS Stakeholder Liaison

  The pack follows IRS Pub 5708 and 16 CFR 314.4. Each export logs `compliance.evidence_exported`. It is evidence for the firm's WISP, not the WISP itself. *Why:* it is generated from live config, so it never goes stale.

### Retention purge (PROD-03)

- **D-16: Retention clock.**
  - `retention_days` defaults to 730 (minimum 30).
  - The D-05 trigger also maintains `cases.last_activity_at` from staff, client and provider events. System events never extend it.
  - `dailyJobs` gains `retentionTick`, which calls `retention_due(20)`. That sets `retention_until` and enqueues `purge_case` for each case that is due and not yet purged.
  - The case view shows "Data kept until {date}".
  - — **Reversibility:** one-way — purged data cannot be restored, so add a checkpoint before turning the production cron on.
- **D-17: The `purge_case` job.** It is idempotent and runs these steps:
  1. Remove live providers (Plaid `/item/remove`, Teller `DELETE /accounts`, Truv `DELETE /v1/links/{id}/`), delete their secrets, and clear `connections.data`.
  2. List the `storage.objects` names under `firm/{firm}/case/{case}/` with an RPC, then delete them with the Storage API `remove()` in batches of 100 or fewer. Never delete them with SQL.
  3. Delete the case's `bank_transactions`, `client_sessions` and `case_financial_data`.
  4. Keep `documents` rows as metadata only: set `status='deleted'` and null out the path and name.
  5. Keep `events`, `consents`, `logics_pushes` and the requests.
  6. Set `purged_at` and log `case.purged {counts}`.

  *Why:* Logics is the system of record, and Safeguards caps retention at 2 years after last use.

### AI document classification (PROD-04)

- **D-18: Scope and trigger.**
  - The AI only classifies a document: its type, period and institution.
  - The firm setting `ai_classification` defaults to false. The sandbox demo turns it on.
  - When it is on, Phase 3's upload finalize enqueues `classify_document` for client uploads.
  - A Phase 7 deterministic classifier port, if one exists, runs first. The LLM is called only when that returns `unknown`.
  - `unpdf@1.8.1` extracts text from the first 2 pages, up to 4,000 characters.
  - Images and scanned PDFs are marked `ai_status='skipped'`. There is no OCR or vision model.
  - *Why:* IRC 7216 is not yet cleared, and pixels cannot be redacted.
- **D-19: Redaction.** `app/worker/src/ai/redact.ts` works in three passes:
  1. Replace the case's known PII exactly: name, email, phone and address.
  2. Apply regexes ported from Presidio's US recognizers (MIT): SSN (with its invalid-range filter), ITIN, EIN, card numbers (with a Luhn check), email, phone, street lines, and dates near "birth/DOB". Any run of 8 or more digits becomes `[NUMBER]`.
  3. Fail closed: if a run of 7 or more digits, or anything SSN-like, remains, skip the call.

  Tests use synthetic text from `examples/`. *Why:* this addresses PITFALLS C12 without a heavy dependency (`redact-pii` is deprecated).
- **D-20: The OpenRouter call.** `app/worker/src/ai/openrouter.ts` POSTs to `https://openrouter.ai/api/v1/chat/completions` with:
  - `model: env.OPENROUTER_MODEL`
  - `provider: { zdr: true, data_collection: "deny", allow_fallbacks: false }`
  - `temperature: 0`
  - a strict `response_format` JSON schema whose label enum is the `_REQUESTS` document codes plus `other`
  - no `user` field, and a 20 s timeout

  If the call errors, or no ZDR endpoint is available, the result is `ai_status='skipped'` and an `ai.unavailable` log line that carries only the `error_code`. Successful results are stored in `documents.ai_suggestion {label, period_start, period_end, institution, confidence, model}`.
- **D-21: Staff confirmation.** The review chip reads like "Suggested: Bank statement · Aug-Oct 2026".
  - Accept sets `document_type` and `ai_reviewed_by` and logs `document.ai_accepted`. Dismiss discards the suggestion.
  - A suggestion never changes item status, never approves anything, and never feeds `case_financial_data`.

### Production access and wording (PROD-01)

- **D-22: One statement.** `docs/compliance/use-of-data.md` holds the statement. Draft:

  > {Firm} uses ResSpark to collect the documents it needs to prepare your tax returns and tax paperwork. With your permission we securely retrieve up to 6 months of bank transactions and statements and your pay stubs, W-2s and income and employment details, and share them only with {Firm}. We never see your bank or payroll password. We delete this information within 2 years of your case's last activity.

  - It is reused verbatim in `app/src/lib/consent-text.ts`, with `text_version` bumped so clients re-consent.
  - It also appears on the public `/privacy` route (`app/src/routes/privacy.tsx`, linked from the portal footer and the consent sheets), in Plaid's DTM use cases (up to 3), and in the Truv application.
  - Cutover is env-only (`PLAID_ENV=production`, Truv production keys, `APP_ENV=production`, `LOGICS_MODE=live`), gated by `docs/compliance/production-checklist.md`.
  - Smoke checks that the consent `text_version` matches the statement.
  - *Why:* this keeps Andrew's framing consistent everywhere (PITFALLS C7).

### Data, secrets and migration

- **D-23: Migration.** `supabase/migrations/0010_reminders_gate_retention.sql`, split into `0011_*` if it would pass 500 lines (0007 is Phase 6; 0008 and an optional 0009 seed file are Phase 7).
  - Columns on `requests`: the D-01 columns, `identity_gate`, both digests, and `last_client_progress_at`.
  - Columns on `client_links`: `gate_failures` and `gate_locked_at`.
  - Columns on `cases`: `last_activity_at` and `purged_at`.
  - Columns on `documents`: the `ai_*` columns.
  - The `events_after_insert` trigger.
  - RPCs: `reminders_due`, `reminder_claim`, `gate_attempt`, `retention_due`, `case_storage_object_names`, `case_mark_purged`, `document_ai_review`.
  - The regenerate RPC also resets the gate failure count.
  - `request_dashboard_v` gains appended columns.
  - RLS is on and grants are revoked.
- **D-24: New config.** All of these are optional; each feature shows "not configured" until they are set.
  - Secrets: `TELLER_SIGNING_SECRET`, `OPENROUTER_API_KEY`.
  - Vars: `TELLER_APPLICATION_ID`, `TELLER_ENV=sandbox`, `TELLER_TOKEN_SIGNING_KEY` (a public key), `OPENROUTER_MODEL`.
  - Binding: `TELLER_CERT`.
  - Provision them over stdin with `provision-secrets.mjs --provider`.

### Claude's Discretion

- Copy, Settings layout, regex tuning, Teller page size, CSV columns, and section order in the evidence pack.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope, research and rules

- **Scope:**
  - `.planning/ROADMAP.md` §Phase 8
  - `.planning/REQUIREMENTS.md` REM-01..04 and PROD-01..04
  - `.planning/PROJECT.md` ("What Andrew asked for", Out of Scope, Constraints)
  - `.planning/Client/call1.md` line 68 and lines 80-104 (Plaid framing, Teller, cost)
- **Research:**
  - `.planning/research/SUMMARY.md` lines 46, 84-86, 215-226 and 256-261
  - `STACK.md` §5 and lines 346-347
  - `FEATURES.md` §(g) and lines 110, 142 and 203
  - `ARCHITECTURE.md` §5 and lines 419 and 451-453
  - `PITFALLS.md` C7, C10, C11, C12, M1 and M3
- **Contracts:**
  - `Logics_API_Documentation.docx.md` lines 588 and 639 (`DOB`, `MM/dd/yyyy`) and line 790 (`StopSMS`)
  - `src/schemas/database_schema.sql` (additive changes only)
  - `src/intake_workflow.py` `_REQUESTS` and `src/frontend/src/document-upload/requests.ts`
- **Rules:** `CLAUDE.md`, `.claude/CLAUDE.md`, `.agents/skills/supabase/SKILL.md` and `.agents/skills/supabase-postgres-best-practices/SKILL.md`.

### Prior phases (under `.planning/phases/`)

- **Phase 01:** `01-CONTEXT.md`, `01-06-PLAN.md` (`staffAuth`), `01-07-PLAN.md` (token, `rs_client`).
- **Phase 02:** `02-CONTEXT.md`, `02-01-PLAN.md` (RPCs, regenerate), `02-04-PLAN.md` (`resend.ts`), `02-07-PLAN.md` (`clientSession`, the `/api/c/state` test).
- **Phase 03:** `03-CONTEXT.md`, `03-01-PLAN.md` (dashboard view, finalize), `03-03-PLAN.md` (`document.viewed`), `03-05-PLAN.md` (mirror card).
- **Phase 04:** `04-CONTEXT.md`, `04-RESEARCH.md`, `04-01-PLAN.md` (`BankProvider`), `04-02-PLAN.md` (`cron.ts`), `04-03-PLAN.md` (`consent-text.ts`), `04-04-PLAN.md` (Plaid provider, nonce).
- **Phase 05:** `05-CONTEXT.md` and `05-03-PLAN.md` (cron step and DLQ pattern).
- **Phases 06 and 07, when written:** `06-address-e-sign/06-CONTEXT.md` and `07-433-a-pre-population/07-CONTEXT.md` (migration numbers, address fields, DocuSeal files, classifier port).

### External docs (verified 2026-10-11)

- **Teller:**
  - https://teller.io/docs/api/authentication
  - https://teller.io/docs/guides/connect
  - https://teller.io/docs/api/webhooks
  - https://teller.io/docs/api/account/transactions
  - https://teller.io/docs/api/accounts
- **Cloudflare mTLS:** https://developers.cloudflare.com/workers/runtime-apis/bindings/mtls/
- **Supabase TOTP:** https://supabase.com/docs/guides/auth/auth-mfa/totp
- **OpenRouter:**
  - https://openrouter.ai/docs/guides/routing/provider-selection
  - https://openrouter.ai/docs/guides/features/zdr
- **IRS Pub 5708:** https://www.irs.gov/pub/irs-pdf/p5708.pdf
- **FTC Safeguards Rule:** https://www.ftc.gov/legal-library/browse/rules/safeguards-rule
- **Plaid:**
  - https://plaid.com/docs/launch-checklist/
  - https://plaid.com/docs/link/data-transparency-messaging-migration-guide/
  - https://plaid.com/docs/sandbox/ (Chase, BofA and WF need full Production plus OAuth)
- **Truv:**
  - https://truv.com/docs/developers/testing/launch-checklist
  - https://docs.truv.com/api-reference/links/delete_link_by_link_id

### Repos (stars and licenses checked 2026-10-11)

| Repo | Stars | License | Use |
|------|-------|---------|-----|
| `data-privacy-stack/presidio` (formerly microsoft) | 11.3k | MIT | Port US regexes into `redact.ts`; credit in `app/LICENSES.md` |
| `satnaing/shadcn-admin` `src/features/auth/otp` | 15.7k | MIT | Copy for the MFA verify screen |
| `guilhermerodz/input-otp` | - | MIT | Installed 1.4.2 (latest 1.5.0); keep the pin |
| `supabase/supabase` MFA docs | - | Apache-2.0 | Copy the enroll/verify shape |
| `unjs/unpdf` | 1.2k | MIT | `unpdf@1.8.1`; re-verify on npm at plan time |
| `solvvy/redact-pii` | 218 | MIT | Reference only (deprecated, pulls in `@google-cloud/dlp`) |
| `tellerhq/examples`, `tellerhq/teller-connect-react` | 26, 10 | none | Read only; write our own wrapper |
| `seziro-team/gather` | 0 | AGPL-3.0 | Patterns only (cadences, quiet hours, safeguards mapping) |

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **Logger:** `app/worker/src/log/logger.ts`. Phase 8 logs only `error_code`, never prompts, entered values or digests.
- **Wrangler config:** `app/wrangler.jsonc` has the queue, DLQ, `*/15` cron and `invocation_logs: false`. Phase 4 adds `0 3 * * *`; Phase 8 adds `mtls_certificates` and vars.
- **OTP input:** `app/src/components/ui/input-otp.tsx` (`input-otp@1.4.2`).
- **Phase 1-5 modules:**
  - Auth and session: `staff-jwt.ts`, `staff-auth.ts`, `client-link.ts`, `client-session.ts`, `link-rate-limit.ts`.
  - Integrations: `email/resend.ts`, `bank/{provider,index,start}.ts`, `token-vault.ts`.
  - Jobs and data: `routes/webhooks.ts`, `jobs/{index,reconcile,dlq}.ts`, `cron.ts`, `db/*`, `storage/case-documents.ts`.
  - SPA: `lib/{status,consent-text,polling}.ts`, `features/{dashboard,review,client-portal,settings}`.
  - Scripts: `provision-secrets.mjs`, `smoke.mjs`, `db-migrate.mjs`.

### Established Patterns

- Writes go through RPCs that log their event, and status is derived in SQL.
- External writes are claimed first and never blindly retried.
- Each cron step has its own try/catch.
- Every boundary has a type guard.
- Every code file has a companion doc in `docs/` and stays under 500 lines.

### Integration Points

- **Cron:** `cron.ts` gains `reminderTick` and `retentionTick`.
- **Jobs:** `jobs/index.ts` gains `send_reminder`, `purge_case` and `classify_document`.
- **Webhooks:** `routes/webhooks.ts` gains the `teller` verifier.
- **Auth:** `staffAuth` adds the `aal` check, and `clientSession` adds the gate.
- **Uploads:** finalize in `routes/c-uploads.ts` enqueues the classify job.
- **SPA:**
  - `features/review` (AI chip), `features/dashboard` (stuck badge and chip), `features/settings`.
  - New routes: `admin/mfa/*` and `privacy.tsx`.

</code_context>

<specifics>
## Specific Ideas

- **Andrew's words:**
  - Chasing documents takes "a third of our days": "you call, text, email these people who are procrastinators".
  - Teller is "a one-line configuration change... save you a ton of cash", though it gives less hand-holding than Plaid.
  - On Plaid: "I help people prepare tax returns... tax paperwork". Plaid costs about $10-14 per user.
- **Plain copy:** Sandra is not tech-savvy, so all copy stays plain.
- **Demo:** the Oct 12 demo shows this phase as "coming next". MFA, the gate and reminders must not break `smoke --auth` or `smoke --client-flow`.
- **Legacy Python:** `src/document_parse.py` `_llm_json` sends raw text to OpenRouter. It is localhost-only and must never be wired into the platform.

</specifics>

<deferred>
## Deferred Ideas

- **Messaging:**
  - Own SMS reminders.
  - A Logics note per reminder.
  - Emailing the agent when a client is stuck.
  - Quiet hours in the client's timezone.
- **Security and data:**
  - A staff "purge now" action and client deletion requests.
  - Idle-session timeout and passkey MFA.
  - Key rotation and a hash-chained audit export.
  - A pen test, an accessibility audit and CI dependency scanning.
- **AI and providers:**
  - OCR or vision classification, and AI extraction of 433-A values.
  - Deleting Truv links at 30 days, and a monthly Plaid statement top-up.

</deferred>

## USER ACTION

1. **ValorTax counsel:**
   - Confirm IRC 7216 consent covers AI on redacted text before `ai_classification` is turned on for real clients.
   - Decide whether the FTC Safeguards Rule applies, name a Qualified Individual and adopt the WISP.
   - Run a TCPA check of the email-only reminders and the consent script.
   - Review the use-of-data statement and the privacy page.
   - Sign a ResSpark-ValorTax data-processing and security agreement.
2. **Resend:** verify the sending domain (SPF, DKIM, DMARC), set `RESEND_FROM`, and confirm ValorTax's timezone.
3. **Teller:**
   - Create the account and application, then upload the certificate and key with `wrangler mtls-certificate upload`.
   - Provide the webhook signing secret and token signing key.
   - Note the limits: Development allows 100 enrollments, and Production needs KYB.
4. **Plaid:** request Production access, then complete:
   - the profiles and the security questionnaire
   - the DTM use cases
   - OAuth registration (Chase)
   - the privacy policy URL
5. **Truv:** get production keys and work through the launch checklist.
6. **Staff:** each person installs an authenticator app. Name the firm admin who handles MFA resets.
7. **OpenRouter:** confirm `OPENROUTER_MODEL` has ZDR endpoints, and turn on account-level ZDR-only.
8. **Supabase and ValorTax:** confirm the backup/PITR window for the evidence pack, and confirm the 2-year retention default.

---

*Phase: 08-reminders-teller-production-readiness*
*Context gathered: 2026-10-11*
