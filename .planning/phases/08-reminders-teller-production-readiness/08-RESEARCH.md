# Phase 8: Reminders, Teller & Production Readiness - Research

**Researched:** 2026-10-11
**Domain:** cron reminders, client identity gate, Teller (mTLS) bank provider, Supabase TOTP MFA, retention purge, redacted ZDR LLM classification, production-access compliance
**Confidence:** MEDIUM-HIGH (vendor contracts verified on primary docs; three Teller details need a sandbox spike)

## Summary

Every locked decision in 08-CONTEXT.md can be built on the existing stack with **no new runtime dependency** except `unpdf@1.8.1`. Phase 7 D-17 already adds it; Phase 8 adds it only if that wave slipped. Primary docs confirm the vendor contracts behind D-09..D-14 and D-17..D-20, with four material refinements:

1. **Teller transactions accept `start_date`/`end_date`.** Both are inclusive ISO dates. Use them for the 180-day window, and keep `count`/`from_id` only as a fallback for timeouts. Teller never states the sign convention of `amount`, and the docs example shows an ATM withdrawal as `"42.47"`. The sign-flip fixture must therefore be captured from sandbox, not invented.
2. **Teller's enrollment signature is under-specified.** The docs say "ED25519 with a SHA-256 digest" over `nonce.accessToken.userId.enrollmentId.environment`, but give no key encoding, no signature encoding, and do not say whether the SHA-256 is applied before signing. The D-11 spike must freeze one real sandbox `onSuccess` payload as the fixture.
3. **OpenRouter silently ignores `response_format` unless `require_parameters: true` is set.** Add it to the D-20 `provider` object.
4. **D-17 cannot run against the current schema as written.** `documents.storage_key` and `original_filename` are `NOT NULL`, so purged rows need tombstones. D-17 also misses the PII stores added by Phases 2, 6 and 7, and Teller webhook payloads.

The identity gate also conflicts with Phase 6's 3-tap signing test (SIGN-04). The rest is plumbing on Phase 1-5 contracts.

**Primary recommendation:** run the Teller spike first, against the real sandbox and development environments: the mTLS binding, a signed `onSuccess` payload, and a transactions sample. Build reminders, the gate and MFA in parallel. Ship the purge behind `RETENTION_ENABLED="false"`, with a human checkpoint before it is turned on.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Reminder due/claim/stop | Database (`reminders_due`, `reminder_claim`) | Worker cron + queue job | State guard and DST-correct `AT TIME ZONE` in one query; Worker only sends |
| Stuck alert | Database (view columns, trigger) | SPA badge/chip | Computed on read (D-05) |
| Identity gate + lockout | Worker (`POST /api/c/verify`) | Database (`gate_attempt`) | HMAC key only in Worker; counter atomic in SQL |
| Teller connect | Browser (Teller Connect iframe) | Worker (`teller-complete`, Ed25519, token vault) | Token verified server-side before storage |
| Teller API | Worker (`env.TELLER_CERT.fetch`) | — | Client cert bound to Worker |
| MFA enroll/verify | Browser (supabase-js auth only) | Supabase Auth | P1 D-15 |
| MFA enforcement | Worker `staffAuth` (JWT `aal`) | — | Worker is the only data path |
| Evidence pack | Worker (generated MD/CSV) | `docs/compliance/*.md` | Built from live config |
| Retention purge | Worker queue `purge_case` | RPCs + Storage API | Objects deleted via API, never SQL |
| AI classification | Worker queue `classify_document` | OpenRouter (ZDR) | Redaction and fail-closed next to the call |
| Use-of-data statement | `docs/compliance/use-of-data.md` + `consent-text.ts` | SPA `/privacy` | One text, unit-tested equality |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

Discussion ran in `--auto` mode. `[auto] Selected all gray areas: reminder cadence/storage, stuck alert, identity gate, Teller switch, staff MFA, WISP pack, retention purge, AI classification, production wording, migration number.` Each decision below is the recommended option, followed by a one-line *Why*. The Phase 6 and 7 CONTEXT files did not exist yet, so ROADMAP's migration numbers `0007` and `0008` are assumed for them. Override anything here before planning.

**Carried forward (do not re-decide):**

- The Worker is the only data path, scoped by `firm_id`. The logger is allowlisted.
- `rs_client` is a signed 24 h cookie, `{ link_id, exp }`, set by `GET /c/:token`. `clientSession` trusts only that cookie, plus `X-Requested-With: ResSpark` on POSTs.
- Email goes through Resend over `fetch`.
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
  - It then sends through Phase 2's `email/resend.ts` and logs `reminder.sent {n}` or `reminder.failed`. A claimed reminder is never re-sent.
  - With no `RESEND_API_KEY`, the step does nothing and Settings shows "Reminders paused: email not configured".
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

### Deferred Ideas (OUT OF SCOPE)

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
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REM-01 | ≤3 reminder emails, configurable cadence, stop at complete/revoked | SQL due/claim with a 20 h floor (Pitfall 1); Resend `Idempotency-Key`; `AT TIME ZONE` quiet hours |
| REM-02 | Stuck-client alert after N hours | Trigger keyed on verified `events.actor_type` enum; view columns appended |
| REM-03 | Teller second provider, transactions only, one switch | Teller API/Connect/webhook contracts; mTLS binding; six `BankProvider` deltas (Pattern 4) |
| REM-04 | Identity gate (DOB or last-4 phone), on by default | Logics CaseInfo returns `DOB` (`MM/dd/yyyy`) and 3 phones; reserve-then-verify lockout; HMAC `verify` compare |
| PROD-01 | Consistent use-case statement, consent, privacy; Plaid/Truv production | Plaid DTM has "Prepare your taxes"; Truv launch checklist; statement-equality unit test |
| PROD-02 | Staff MFA enforced; WISP evidence pack | Supabase TOTP API (auth-js 2.117.3 read in repo); JWT `aal`; admin `deleteFactor`; 16 CFR 314.4 + Pub 5708 map |
| PROD-03 | Retention purge (default 2 y), audit kept | Storage `remove()`, Plaid `/item/remove`, Teller `DELETE /accounts`, Truv `DELETE /v1/links/{id}/`; tombstones; extended purge list |
| PROD-04 | AI classification on redacted text, ZDR, staff-confirmed | OpenRouter `provider` + `require_parameters`; live ZDR list; Presidio regexes; `unpdf` |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Stack:** TypeScript front end; the Hono Worker is the only data path. Supabase holds data, auth and storage; Cloudflare hosts; OpenRouter is the only LLM route.
- **Code rules:**
  - No code file over 500 lines.
  - Each code file has a companion doc under `docs/`, mirroring its path.
  - Ponytail: make the smallest complete change.
  - Tests use Vitest.
- **Determinism:** IRS math is untouched. AI suggestions never feed `case_financial_data` (D-21).
- **Security baseline:**
  - Secrets stay server-side.
  - RLS on every table.
  - Download URLs are signed and short-lived.
  - Every action lands in the audit log.
  - Client links are unguessable and expire.
  - No raw document goes to an LLM without a deliberate decision. D-18/D-19 is that decision, still gated on counsel (USER ACTION 1).
- **Supabase work:**
  - Load the `supabase` and `supabase-postgres-best-practices` skills.
  - Every migration revokes grants, because `pg_default_acl` still grants new objects to `anon`/`authenticated` [VERIFIED: 0002_platform_foundation.sql:124-130].
- **Secrets handling:** never print `.env` values. Run wrangler through `dotenv-cli`.

## Standard Stack

| Library | Version | Purpose | Provenance |
|---------|---------|---------|-----------|
| `hono` | 4.13.13 | routes, signed cookies | [VERIFIED: app/package.json] |
| `jose` | 6.2.12 | staff JWT (ES256 JWKS); read `aal` | [VERIFIED: app/package.json; npm view] |
| `@supabase/supabase-js` | 2.117.3 | `auth.mfa.*`, `auth.admin.mfa.deleteFactor`, Storage `remove()` | [VERIFIED: installed `@supabase/auth-js@2.117.3` types.d.ts:1110-1130, 1970-1990] |
| `zod` | 4.3.6 | `FirmSettings`, verify body, LLM output | [VERIFIED: app/package.json] |
| `input-otp` | 1.4.2 (latest 1.5.0) | TOTP field; `components/ui/input-otp.tsx` exists | keep pin (D-13) [VERIFIED: npm view; app/src] |
| Web Crypto | runtime | HMAC-SHA256; Ed25519 verify | Workers support `Ed25519` sign/verify/importKey [CITED: developers.cloudflare.com/workers/runtime-apis/web-crypto]; raw-key import + verify proven on Node 24 [VERIFIED: local probe] |
| `unpdf` | 1.8.1 (MIT, 2026-08-13, 5.5M/wk) | first-2-pages text | Reuse Phase 7 `extract/pdf-text.ts`; add only if Phase 7 D-17 slipped [VERIFIED: npm view; legitimacy OK] |
| Node `crypto` (scripts) | Node ≥22.12 | `app/scripts/lib/totp.mjs` | D-14 helper; RFC 6238 vectors |

**Alternatives considered:**
- **`otpauth@9.5.2` (MIT)** would add a dependency for about 20 lines. D-14 locks the helper instead.
- **`redact-pii`** is deprecated and pulls in `@google-cloud/dlp`.
- **Worker `Intl` for timezone math** is rejected: SQL keeps the due rule in one query. `Intl` is only for SPA display ("next Tue 9:00").

**Installation:** none, unless Phase 7 D-17 slipped. In that case run `pnpm -C app add unpdf@1.8.1`.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| unpdf | npm | 1.8.1 published 2026-08-13 | 5,573,749/wk | github.com/unjs/unpdf | OK | Approved (only if Phase 7 did not add it) |

**Removed [SLOP]:** none. **Flagged [SUS]:** none. `otpauth` is deliberately not installed.

## Architecture Patterns

### System Architecture Diagram

```
cron */15 ─► reminderTick ─► reminders_due(50) ─► reminder_claim(id,n) ─► JOBS send_reminder ─► resend.ts (Idempotency-Key)
cron 0 3  ─► retentionTick (RETENTION_ENABLED) ─► retention_due(20) ─► JOBS purge_case
              purge_case: providers ─► secrets ─► Storage remove() ─► tables ─► tombstones ─► case_mark_purged

Client ─► GET /c/:token ─► rs_client{link_id,exp} ─► /api/c/state ─► gate:"required"
       ─► POST /api/c/verify ─► gate_attempt (reserve) ─► HMAC verify ─► rs_client{…,gate:1,v}
       ─► requireGatePassed ─► all other /api/c/*

Bank step ─► capabilities.hostedLink ? Plaid Hosted Link : TellerConnect.setup({nonce})
  onSuccess ─► POST /api/c/connections/:id/teller-complete ─► consume nonce ─► Ed25519 verify (server TELLER_ENV)
           ─► sealToken/saveSecret ─► JOBS reconcile ─► TELLER_CERT.fetch /accounts, /transactions
Teller webhook ─► /api/webhooks/teller ─► HMAC(`${t}.${raw}`) any v1, |now-t|≤180 s ─► strip payload ─► webhook_events ─► queue

Staff ─► password (aal1) ─► AAL check ─► /admin/mfa/enroll | /admin/mfa/verify ─► aal2 JWT
      ─► staffAuth: jwtVerify ─► aal==="aal2" else 401 mfa_required (except /api/admin/session)

Upload finalize ─► (ai_classification) JOBS classify_document ─► unpdf 2 pages ≤4k chars ─► classify_upload port
  ─► unknown? ─► redact 3 passes ─► residue? skip : OpenRouter ZDR ─► Zod ─► documents.ai_suggestion ─► staff Accept/Dismiss
```
New files follow the paths already named in CONTEXT. Migration: `0010_reminders_gate_retention.sql` (+`0011_*` past 500 lines).

### Pattern 1: Reminder claim with a minimum gap (REM-01)
```sql
-- reminder_claim (sketch): one concurrent winner; next due floored so overdue rows cannot fire back-to-back
UPDATE public.requests r
   SET reminder_count = r.reminder_count + 1, last_reminder_at = now(),
       next_reminder_at = CASE WHEN r.reminder_count + 1 < p_cadence_len
         THEN GREATEST(r.sent_at + make_interval(days => p_cadence[r.reminder_count + 2]), now() + interval '20 hours')
         ELSE NULL END
 WHERE r.id = p_request_id AND r.reminder_count = p_expected_count
   AND r.reminders_enabled AND r.status IN ('sent','opened','in_progress')
RETURNING r.reminder_count;   -- 0 rows: already claimed or no longer due
-- reminders_due: … AND extract(hour FROM now() AT TIME ZONE (f.settings->'reminders'->>'timezone'))
--   >= send_hours[1] AND < send_hours[2]   -- half-open, DST-correct; plus link live, not waiting_on_staff
```
- **Deferral (D-02):** `reminders_due` first runs `UPDATE … SET next_reminder_at = last_client_progress_at + interval '24 hours'` [ASSUMED: shape].
- **Send:** `POST https://api.resend.com/emails` with `Idempotency-Key: reminder-{request_id}-{n}` [CITED: resend.com/docs/dashboard/emails/idempotency-keys].
  - Keys are 1-256 characters and are kept for 24 h.
  - The same payload sent again under the same key returns the original id and sends nothing.
  - So a queue retry of `send_reminder {request_id, n}` is harmless, on top of D-03's claim.
- **Reply-to:** the agent's email, read from `auth.users` with the admin client. `staff_profiles` has no email column [VERIFIED: 0002:29-35].

### Pattern 2: Identity gate, reserve-then-verify (REM-04)
- **Fields:** Logics `Case/CaseInfo` returns `"DOB": "07/24/1995"`, `"CellPhone"`, `"HomePhone"` and `"WorkPhone"` [VERIFIED: Logics_API_Documentation.docx.md:588].
  - Documented formats: `DOB` is "MM/dd/yyyy" (type `DateTime`); phones are "(xxx)xxx-xxxx" [VERIFIED: :617-619, :639].
  - Sample data also includes 9-digit phones such as `"234234232"` (:1031). Phase 2 D-04 normalization rejects them, so `phone_e164` (and with it the phone method) can be NULL.
```ts
// key = HMAC(CLIENT_LINK_HMAC_KEY, "identity-gate-v1") (D-06); message "dob:YYYY-MM-DD"
const dobIso = (s: string) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s.trim()); if (!m) return null
  const iso = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; return Number.isNaN(Date.parse(iso)) ? null : iso }
// compare: crypto.subtle.verify('HMAC', key, storedDigest, enc(msg)) — constant-time on Workers AND Node.
// crypto.subtle.timingSafeEqual is Workers-only (undefined on Node 24, VERIFIED probe) → worker-node tests would crash.
```
**Lockout order:** call `gate_attempt` *before* the compare.
- It runs `UPDATE client_links SET gate_failures = gate_failures + 1 WHERE id=$1 AND gate_locked_at IS NULL AND gate_failures < 5 RETURNING gate_failures`. No row back means the link is locked.
- The reserved 5th failure sets `gate_locked_at`.
- A pass resets the count and logs `client.gate_passed`.
- Counting after the compare would let N parallel requests each read 0 and buy N guesses.

### Pattern 3: MFA enforcement (PROD-02)
```ts
// staff-auth.ts after jwtVerify(issuer `${SUPABASE_URL}/auth/v1`, audience 'authenticated')
if (path !== '/api/admin/session' && payload.aal !== 'aal2') throw new HTTPException(401, { message: 'mfa_required' })
```
- **Claim default:** a token without `aal` counts as `aal1` [CITED: supabase.com/docs/guides/auth/auth-mfa].
- **SPA routing:** `mfa.getAuthenticatorAssuranceLevel()` returns `{currentLevel, nextLevel, currentAuthenticationMethods}` [VERIFIED: auth-js types.d.ts:1110-1130].
  - `nextLevel==='aal1'` routes to enroll.
  - `currentLevel` `aal1` with `nextLevel` `aal2` routes to verify.
- **Enroll:** `mfa.enroll({factorType:'totp'})` returns `totp.{qr_code, secret, uri}`.
  - supabase-js **already prefixes** `qr_code` with `data:image/svg+xml;utf-8,` [VERIFIED: GoTrueClient.js:4869-4893], so use it as `<img src>` unchanged.
  - `listFactors().totp` holds verified factors only; `.all` includes unverified ones [VERIFIED: GoTrueClient.js:5012-5040]. Unenroll stale unverified factors before re-enrolling.
- **Reset:** `auth.admin.mfa.deleteFactor({ userId, id })` calls `DELETE /admin/users/{userId}/factors/{id}` [CITED: context7 /supabase/supabase-js]. An existing aal2 session drops only at refresh [CITED: auth-mfa docs].
- **Events:** `/api/admin/session` accepts `mfa_enrolled`/`mfa_verified` only from an `aal2` token.
- **OTP screen:** `app/src/features/auth/` holds only `sign-in/`; the fork stripped the OTP screen. Copy `src/features/auth/otp` from upstream `satnaing/shadcn-admin@e16c87f` (MIT).

### Pattern 4: Teller on the Phase 4 contract (REM-03)
**API** [CITED: teller.io/docs/api/{authentication,accounts,account/transactions}]:
- **Auth:** base URL `https://api.teller.io`; the token is the Basic-auth user with an empty password. mTLS is optional in sandbox and **required** in development and production.
- **Accounts:** `GET /accounts` returns `id, enrollment_id, institution{id,name}, last_four, name, type, subtype, status, currency, links`.
- **Transactions:** `GET /accounts/:id/transactions?start_date=&end_date=&count=&from_id=`
  - Dates are inclusive. With no controls, it returns everything.
  - The first call "can sometimes time out", so retry it.
  - `amount` is a signed string; `status` is posted or pending.
  - A pending row can post under a **new id**.
- **Removal:** `DELETE /accounts` ends access to the enrollment and stops transactions billing (204).
- **No Cloudflare proxy:** `api.teller.io` is an AWS ELB, not a Cloudflare-proxied zone, so the "mTLS to a proxied zone → 520" limit does not apply [VERIFIED: nslookup; CITED: CF mTLS doc].

**Contract deltas** (Phase 4 `04-01-PLAN.md` interfaces):
1. **Start response:** `{ hosted_link_url } | { connect: { applicationId, environment, nonce } }`, keyed by `capabilities.hostedLink`, because Teller has no URL. The nonce goes in `connections.return_nonce`, and `consumeReturnNonce` uses it once.
2. **New route:** `POST /api/c/connections/:id/teller-complete`, because `completeSession` cannot take Teller's payload. It:
   1. consumes the nonce;
   2. verifies the signature with the **server's** `TELLER_ENV`;
   3. calls `sealToken`/`saveSecret`;
   4. sets `external_id = enrollment.id`;
   5. enqueues a reconcile.
3. **Transaction ids:** Teller `txn_…` ids go unchanged into `bank_transactions.plaid_transaction_id` (`text not null unique`). They do not collide with Plaid ids. The column name is a wart, but renaming it would touch the 04-02 ordering.
4. **Sync result:** `syncTransactions` returns the whole 180-day set as `added`, with `cursor: null`. `removed` holds this connection's **pending** ids that are missing from the response.
5. **Webhooks and removal:** widen `WebhookAdapter.id` to `'plaid'|'truv'|'docuseal'|'teller'`. `listRemovalCandidates` filters on `provider='plaid'` today; add `teller`.
6. **Provider choice:** `bankProvider(env)` and `providerConfigured(env, env.BANK_PROVIDER)` read `firms.settings.bank_provider ?? env.BANK_PROVIDER`.

**CSP:** `connect.js` injects an iframe on `https://teller.io` [VERIFIED: downloaded cdn.teller.io/connect/connect.js]. Add `script-src https://cdn.teller.io` and `frame-src https://teller.io` to `middleware/client-csp.ts`.

### Pattern 5: Retention purge (PROD-03)
Each step is idempotent, and `case_mark_purged` runs last.
1. **Providers:**
   - Plaid: `/item/remove`.
   - Teller: `DELETE /accounts` through the binding.
   - Truv: `DELETE /v1/links/{link_id}/` for **every** `connections.data.employers[].link_id`. It takes the `X-Access-Client-Id`/`X-Access-Secret` headers, returns 204, and "removes a link and all associated data" [CITED: docs.truv.com/api-reference/links/delete_link_by_link_id].
   - A 404 means already gone.
   - Delete `connection_secrets` **only after** removal is confirmed. Otherwise throw, so the job retries and then lands in the DLQ. A dropped live Plaid token keeps billing.
2. **Storage:** get the names from `case_storage_object_names`, then call `storage.from('case-documents').remove(batch)` with at most 100 per call. The API limit is 1000 [CITED: supabase.com/docs/guides/storage/management/delete-objects].
3. **Tables:** delete `bank_transactions`, `bank_accounts` and statement months, `client_sessions`, `case_financial_data`, and Phase 7 `financial_proposals`/`determination_runs` (Open Question 3).
4. **Documents:** tombstone rather than NULL.
   - Set `status='deleted'`, `storage_key='purged:'||id`, `original_filename='[deleted]'`, and set Phase 3 `storage_path` to NULL.
   - The baseline declares `storage_key TEXT NOT NULL UNIQUE` and `original_filename TEXT NOT NULL` [VERIFIED: src/schemas/database_schema.sql:257-267].
   - `deleted` is already in Phase 3's status set (D-04).
5. **Kept rows lose their PII:** NULL `cases.logics_snapshot`, the Phase 6 address columns, `first_name/last_name/email/phone_e164`, `requests.gate_*_digest` and `documents.ai_suggestion`. Keep `logics_case_id` and all ids.
6. **Keep intact:** `events` (append-only, 0002:94-107), `consents`, `logics_pushes`, `requests`, and the case row (`events.case_id` FK, 0002:41). Set `purged_at` and log `case.purged {counts}` as `actor_type='system'`.

`retention_due` skips cases that have a non-terminal `logics_pushes` row or a live link.

### Pattern 6: AI classification call (PROD-04)
```ts
// openrouter.ts — POST https://openrouter.ai/api/v1/chat/completions, AbortSignal.timeout(20_000)
const body = {
  model: env.OPENROUTER_MODEL, temperature: 0,
  provider: { zdr: true, data_collection: 'deny', allow_fallbacks: false, require_parameters: true },
  response_format: { type: 'json_schema', json_schema: { name: 'doc_class', strict: true, schema } },
  messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: redactedText }],
} // no `user` field (D-20)
```
- **Provider fields** [CITED: openrouter.ai/docs/guides/routing/provider-selection, /features/structured-outputs]:
  - `zdr` is combined (OR) with the account setting.
  - `data_collection` defaults to `"allow"`.
  - `allow_fallbacks:false` uses only the top-priority provider.
  - Without `require_parameters`, `response_format` is a soft preference and is **ignored** when no endpoint supports it.
- **Model:** the live ZDR list (`GET https://openrouter.ai/api/v1/endpoints/zdr`) has 938 endpoints, 634 with `structured_outputs` [VERIFIED: fetched 2026-10-11]. Candidates, per million tokens:

  | Model | Endpoint | Price (in/out) |
  |-------|----------|----------------|
  | `openai/gpt-4o-mini` (default) | azure | $0.15 / $0.60 |
  | `google/gemini-3.1-flash-lite` | vertex/us | $0.275 / $1.65 |
  | `anthropic/claude-haiku-4.5` | bedrock/us | $1.10 / $5.50 |

  Re-check the list at deploy.
- **Label enum:** the `_REQUESTS` codes plus `other`, verbatim from `src/intake_workflow.py:60-72` [VERIFIED]: `"irs_transcripts"`, `"bank_statements"`, `"pay_stubs"`, `"self_employment"`, `"real_property"`, `"lease"`, `"housing_utilities"`, `"vehicle"`, `"retirement"`, `"insurance"`, `"investments"`, `"bankruptcy"`.
- **Deterministic first:** `classify_upload` returns the same codes or `None` [VERIFIED: src/document_parse.py:233-262]. Only `None` sends the document to the LLM.
- **Output check:** Zod validates an enum label, ISO dates and a confidence of 0-1. Anything else sets `ai_status='skipped'`.

### Anti-Patterns to Avoid
- **Counting gate failures after the compare.** Reserve the attempt first.
- **Deleting `storage.objects` rows with SQL.** It orphans the files.
- **Storing Teller webhook payloads verbatim.** `transactions.processed` carries a `transactions` array [CITED: teller.io/docs/api/webhooks]. Keep only `{id, type, timestamp, enrollment_id}`, because `webhook_events` is not case-scoped and the purge would miss it.
- **Using the browser's `environment` in the Teller signature message.** Use the server's `TELLER_ENV`.
- **Applying Presidio's SSN `invalidate_result` while redacting.** It suppresses `078-05-1120`, `123456789`, area `000`/`666` and group `00` [VERIFIED: presidio us_ssn_recognizer.py:55-88]. When redacting, a false positive costs nothing and a false negative leaks, so redact every SSN-shaped match. This refines D-19's "with its invalid-range filter".

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Staff TOTP | own TOTP server | Supabase Auth MFA | free, issues the `aal2` JWT |
| Constant-time compare | `===`, loops | `crypto.subtle.verify('HMAC', …)` | portable; `timingSafeEqual` is Workers-only |
| Ed25519 | `@noble/ed25519` | `crypto.subtle.verify({name:'Ed25519'})` | native on Workers and Node 24 |
| PDF text | pdf.js wiring | `unpdf` (`getDocumentProxy` + per-page `getTextContent`, pages 1-2) | serverless build; `extractText` has no page limit [CITED: context7 /unjs/unpdf] |
| Client certificate | PEM in a secret | `mtls_certificates` binding | env vars cap at 5 KB; no other way to present a cert |
| Duplicate sends | dedup table | `reminder_claim` + Resend `Idempotency-Key` | two cheap layers |
| Timezone/DST | offset tables | Postgres `AT TIME ZONE '<IANA>'` | DST-correct |

Only the smoke-test TOTP generator is hand-rolled (D-14), checked against RFC 6238 vectors.

## Common Pitfalls

1. **Reminder storm after deploy.**
   - *What happens:* a request sent days ago gets `next_reminder_at = sent_at + 1d`, which is already in the past. Reminder 1 sends; if `sent_at + 3d` has also passed, reminder 2 goes out 15 minutes later.
   - *Fix:* backfill only open requests, with `GREATEST(sent_at + cadence[1], now())`, and floor every claim at `now() + 20h`. Overlapping ticks are already safe because of the claim guard.
   - *Warning sign:* two `reminder.sent` events for one request less than 20 h apart.
2. **Timezone.**
   - One bad IANA name makes `AT TIME ZONE` throw for **every** firm. Validate it in Zod: `try { new Intl.DateTimeFormat('en-US', { timeZone }) }`.
   - `send_hours` is half-open, `[start, end)`.
   - The SPA displays times with `Intl` plus `timeZone`, never with a server-local `Date`.
3. **Gate vs. the demo and Phase 6 SIGN-04.**
   - *Demo:* the gate defaults on, so `smoke --client-flow` and the fake-Logics demo case need a DOB. Seed `DOB` into the fake fixture.
   - *Signing:* Phase 6 D-13 counts 3 taps "from a fresh link". Count them after the gate, and have Playwright either pass the gate or use `identity_gate=false`.
   - *Regenerate:* a gate-passed cookie survives `regenerate`. Add the link `version` to the re-issued cookie (`{link_id, exp, gate:1, v}`) and compare it in `requireGatePassed`.
4. **Lockout abuse and the weak phone factor.**
   - Anyone holding a forwarded link can burn all 5 tries. This is accepted: staff regenerate the link, and the per-IP limit stays.
   - `phone4` gives an attacker 5 guesses out of 10,000 per link, so make DOB the primary factor in the UI.
   - With no digests at all, the gate is forced off with a warning (D-06).
5. **"DOB is never stored" is false platform-wide.** Phase 2 D-05 stores the full CaseInfo, DOB included, in `cases.logics_snapshot`, and Phase 7 D-09 reads it there. The gate stores only digests. The evidence pack and privacy copy must not claim more than that, and the purge must NULL `logics_snapshot`.
6. **AAL2 vs. `smoke --auth` and live staff.**
   - *Smoke sequence:*
     1. Password grant.
     2. `GET /auth/v1/user`, then take the `factors[]` entry with `factor_type='totp'` and `status='verified'`.
     3. `POST /auth/v1/factors/{id}/challenge` returns `{id}`.
     4. `POST /auth/v1/factors/{id}/verify {challenge_id, code}` returns an aal2 `access_token` [VERIFIED: auth-js `_challenge`/`_verify`].
   - *Seeding:* `enroll-demo-totp.mjs` calls `POST /auth/v1/factors {factor_type:'totp'}`, then challenge and verify, and writes `DEMO_STAFF_TOTP_SECRET` to `.dev.vars` once.
   - *Rollout:* enforce only after every staff member has enrolled. The SPA maps 401 `mfa_required` to `/admin/mfa/verify`, not to sign-in.
   - *Reuse:* a code reused within one 30 s window may be rejected [ASSUMED]. Smoke retries once after the window rolls over.
7. **The mTLS binding has no local simulation.**
   - Cloudflare recommends `remote: true` and warns when it is missing [CITED: developers.cloudflare.com/workers/development-testing].
   - `wrangler.jsonc` is also read by `@cloudflare/vitest-plugin`. Add the `mtls_certificates` block only once a real certificate id exists; a placeholder fails deploy. After adding it, check that `pnpm test:workerd` and `vite dev` still start.
   - Unit tests inject `env.TELLER_CERT = { fetch: vi.fn() }`.
   - The upload needs a token with the scope "SSL and Certificates Edit" [CITED: mTLS doc].
8. **Teller amount sign and pending re-ids.**
   - The docs say "signed" without giving a direction, and their example withdrawal is positive [CITED].
   - The planned flip, `-Number(t.amount)` to match Plaid's positive = outflow, is [ASSUMED]. Freeze it only after the spike captures one known debit and one known credit.
   - Pending ids that re-post under a new id must be removed, or staff see duplicates.
9. **Redaction false negatives.** Each of these needs its own pattern:
   - *Grouped digits:* `\d{8,}` misses numbers split by spaces or dashes. Use `\d(?:[ -]?\d){7,}` for `[NUMBER]`, and use the same pattern plus `\d{3}[- .]\d{2}[- .]\d{4}` in the fail-closed check.
   - *Names:* match case-insensitively, including upper-case forms.
   - *Phones:* Presidio's phone recognizer depends on `phonenumbers` [VERIFIED: phone_recognizer.py imports], so write a US regex: `\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}`.
   - *EIN:* Presidio US has no EIN recognizer. Use `\b\d{2}-\d{7}\b`.
   - *ITIN:* `\b9\d{2}[- ]?(5\d|6[0-5]|7\d|8[0-8]|9([0-2]|[4-9]))[- ]?\d{4}\b` [VERIFIED: us_itin_recognizer.py:19-31].
   - *ABA routing:* `\b[0123678]\d{8}\b` plus the checksum [VERIFIED: aba_routing_recognizer.py:25-76].
   - *Cards:* the Presidio regex plus a Luhn check [VERIFIED: credit_card_recognizer.py:20-82].
   - *Scanned PDFs:* under roughly 50 non-space characters means the document is scanned, so mark it `skipped`.
10. **Evidence export.**
    - Prefix any cell starting with `= + - @`, tab or CR with `'`.
    - Cap `from/to` at about 366 days.
    - Page through `events` by `id`.
    - Export keys only, never values.
11. **View replacement.** Later phases replace `request_dashboard_v`. `CREATE OR REPLACE VIEW` must keep every column in order and append the new ones. Copy the definition from the highest migration that touches the view.
12. **Retention foot-gun.** `retention_days` can go as low as 30. Make it admin-only, show "{n} cases would be purged" before saving, and log `firm.settings_changed`.

## Code Examples

### Teller mTLS fetch (D-11)
```ts
const tellerFetch = (env: Env, path: string, token: string, init: RequestInit = {}) => {
  const f = env.TELLER_CERT ? env.TELLER_CERT.fetch.bind(env.TELLER_CERT)
    : env.TELLER_ENV === 'sandbox' ? fetch : null            // plain fetch only in sandbox (D-11)
  if (!f) throw new Error('teller_cert_missing')
  return f(`https://api.teller.io${path}`, { ...init, headers: { ...init.headers, Authorization: 'Basic ' + btoa(`${token}:`) } })
}
```
Run `wrangler mtls-certificate upload --cert cert.pem --key key.pem --name teller-<env>`. It prints an id; then add `"mtls_certificates": [{ "binding": "TELLER_CERT", "certificate_id": "<id>" }]` [CITED: CF mTLS doc].

### Teller Connect signature (variant frozen by the spike)
```ts
// "ED25519 with a SHA-256 digest … nonce, accessToken, userId, enrollmentId, and environment concatenated with a dot";
// verify at least one of `signatures` [CITED: teller.io/docs/guides/connect]. Encodings base64 [ASSUMED].
export async function verifyEnrollment(pubB64: string, p: { nonce: string; accessToken: string; userId: string;
  enrollmentId: string; signatures: string[] }, environment: string): Promise<boolean> {
  const key = await crypto.subtle.importKey('raw', b64(pubB64), { name: 'Ed25519' }, false, ['verify'])
  const msg = new TextEncoder().encode([p.nonce, p.accessToken, p.userId, p.enrollmentId, environment].join('.'))
  for (const s of p.signatures) if (await crypto.subtle.verify({ name: 'Ed25519' }, key, b64(s), msg)) return true
  return false // if the spike shows Teller signs SHA-256(msg), verify the digest instead — never accept both
}
```

### Teller webhook (D-12)
```ts
// "Teller-Signature: t=<unix>,v1=<hex>[,v1=…]"; HMAC-SHA256(secret, `${t}.${raw}`); reject t older than 3 min [CITED: teller.io/docs/api/webhooks]
const kv = header.split(',').map((p) => p.split('=', 2))
const t = kv.find(([k]) => k === 't')?.[1]; const v1s = kv.filter(([k]) => k === 'v1').map(([, v]) => v)
if (!t || Math.abs(Date.now() / 1000 - Number(t)) > 180) return null
const key = await crypto.subtle.importKey('raw', enc(env.TELLER_SIGNING_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
for (const v of v1s) if (await crypto.subtle.verify('HMAC', key, hex(v), enc(`${t}.${raw}`))) return { payload: JSON.parse(raw) }
return null // eventKey = payload.id ("wh_…"); payload.enrollment_id → connections.external_id
```
Event types are `enrollment.disconnected` (with `reason`), `transactions.processed`, `account.number_verification.processed` and `webhook.test`. Teller documents no retry behavior, so the 15-minute reconcile is the safety net.

### Smoke TOTP helper — `app/scripts/lib/totp.mjs` (D-14)
```js
import { createHmac } from 'node:crypto'
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const base32 = (s) => { let bits = ''; const out = []
  for (const c of s.replace(/=+$/, '').toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, '0')
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out) }
export function totp(secret, now = Date.now(), digits = 6, step = 30, key = base32(secret)) {
  const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / step)))
  const h = createHmac('sha1', key).update(ctr).digest(); const o = h[h.length - 1] & 15
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]
  return String(n % 10 ** digits).padStart(digits, '0')
}
```
**Test vectors** (RFC 6238 Appendix B: SHA-1, key `Buffer.from('12345678901234567890')`, 8 digits) [VERIFIED: computed locally; matches RFC]:

| T (s) | Code |
|-------|------|
| 59 | `94287082` |
| 1111111109 | `07081804` |
| 1111111111 | `14050471` |
| 1234567890 | `89005924` |
| 2000000000 | `69279037` |
| 20000000000 | `65353130` |

That Supabase uses SHA-1, 6 digits and a 30 s period is [ASSUMED]. Confirm it by parsing the enroll `uri` in `enroll-demo-totp.mjs`.

## State of the Art

| Old | Current | Impact |
|-----|---------|--------|
| OpenRouter `enforce_zdr` | `provider.zdr` + per-model-group account ZDR (`enforce_zdr` deprecated) | Set account ZDR too (USER ACTION 7) |
| Plaid launch checklist | Plaid Launch Center ("no longer being updated") | Production steps live in the Dashboard |
| Presidio under `microsoft/` | `data-privacy-stack/presidio` (11,271 stars, MIT, pushed 2026-10-09) | Credit the new org in `app/LICENSES.md` |

## Compliance Mapping (evidence pack, PROD-01/02)

| Source | Elements used | Provenance |
|--------|---------------|-----------|
| 16 CFR 314.4 | (c)(3) encryption; (c)(5) "Implement multi-factor authentication for any individual accessing any information system" (D-14); (c)(6)(i) disposal "no later than two years after the last date the information is used" (D-16); (c)(8) activity logging (access CSV); (h) incident response plan; (j)(1) FTC notice "no later than 30 days after discovery" for "at least 500 consumers" | [CITED: ecfr.gov via gov index]; (c)(8)/(h) wording summarized |
| IRS Pub 5708 (Rev. 8-2024), 29 pp. | Objectives/purpose/scope; responsible individuals; risk assessment; hardware inventory; safety measures; implementation clause; Attachments A Record Retention, B Rules of Behavior, C Breach Procedures and Notifications, D Acknowledgement, E Hardware Inventory with PII, F Employees Authorized to Access PII | [VERIFIED: TOC extracted with unpdf from irs.gov/pub/irs-pdf/p5708.pdf] |
| Plaid DTM | ≤3 use cases; includes **"Prepare your taxes"** and "Do business accounting and tax preparation"; scopes include "Transactions" and "Bank Statements" → pick "Prepare your taxes" (D-22) | [CITED: plaid.com/docs/link/data-transparency-messaging-migration-guide] |
| Truv launch checklist | UX review; UAT with production test providers; branding/company profile; production keys; webhook URL per environment, `X-WEBHOOK-SIGN` verified, reply within 1 s; retry with backoff; no security or retention step | [CITED: docs.truv.com/developers/testing/launch-checklist] |

**Pack mapping:**

| Pack section | Covers |
|--------------|--------|
| Staff and MFA status | Attachment F; (c)(5) |
| Access summary | (c)(8) |
| Key names and versions | (c)(3) |
| Retention and purges | Attachment A; (c)(6) |
| Incident runbook | Attachment C; (h); (j) |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Teller debits are negative → flip with `-amount` | Pitfall 8 | All Teller amounts inverted; spike fixture resolves |
| A2 | Teller key/signature base64; message is the raw dotted string | Code Examples | Every Teller connect rejected; spike resolves |
| A3 | Supabase TOTP = SHA-1 / 6 digits / 30 s | Code Examples | Smoke fails; parse enroll `uri` |
| A4 | A TOTP code reused in one window may be rejected | Pitfall 6 | Flaky smoke; retry covers |
| A5 | Teller sandbox returns `signatures` when a nonce is set | Pattern 4 | Signature proof only in development |
| A6 | Progress deferral as an UPDATE inside `reminders_due` | Pattern 1 | Design detail only |
| A7 | Purge also NULLs contact/address/snapshot fields and deletes Phase 7 tables | Pattern 5 | Over/under-deletion; needs ValorTax/counsel confirmation |
| A8 | 16 CFR 314.4 (c)(8)/(h) wording | Compliance | Evidence-pack copy only |

## Open Questions

1. **Teller signature encoding/digest — UNRESOLVED.**
   - *Known:* the field order, the dot separator, "ED25519 with a SHA-256 digest", and that several signatures are possible.
   - *Unknown:* the encodings, and whether the SHA-256 is applied before signing.
   - *Plan:* the D-11 spike saves one sandbox `onSuccess` payload and the dashboard key as a fixture. The verifier implements the one variant that passes.
2. **Teller amount sign — UNRESOLVED.** The same spike saves `GET /accounts/:id/transactions` as a fixture.
3. **Purge scope beyond D-17 — RESOLVED as a recommendation; user confirmation needed.**
   - Delete `financial_proposals`, `case_financial_data` and `determination_runs`; the worksheet lives in Logics.
   - NULL the case PII.
   - Strip Teller webhook payloads.
   - The Phase 6 e-sign audit PDF goes with the case prefix, although PITFALLS C11 suggested keeping it longer; Logics holds the pushed copy.
4. **Tombstones vs. NULLs on `documents` — RESOLVED: tombstones.** The baseline `NOT NULL`/`UNIQUE` constraints and the additive-only rule rule out NULLs.
5. **Deterministic classifier missing — RESOLVED.** If Phase 7 D-17 slipped, Phase 8 ports `classify_upload` (about 30 pure lines, src/document_parse.py:233-262) to `app/worker/src/extract/classify.ts` and adds `unpdf@1.8.1`. Otherwise every upload would reach the LLM.
6. **Teller categories for 433-A — UNRESOLVED (out of scope).** Store them as `category_detailed = 'teller.' || category`. Phase 7's `plaid_category_map` then finds no match, so no proposal is made.
7. **Which phone feeds the gate — RESOLVED per D-06.** `cases.phone_e164`. It is NULL for Logics numbers that are not 10 digits, and then only the DOB option is offered.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node / pnpm / wrangler | build, scripts | ✓ | 24.14.0 (engines ≥22.12) / 10.32.1 / 4.149.0 | — |
| Teller account, cert, token signing key, webhook secret | REM-03 | ✗ | — | Sandbox without cert (plain fetch); no real enrollments (USER ACTION 3) |
| CF token scope "SSL and Certificates Edit" | cert upload | unknown | — | create a scoped token |
| `api.teller.io` from this machine | local curl probe | ✗ (TCP timeout from sandbox) | — | run the spike from the deployed Worker |
| `RESEND_API_KEY` + verified domain | REM-01 | unknown | — | reminders paused (D-03) |
| `OPENROUTER_API_KEY` | PROD-04 | name in `.env.example` | — | `ai_status='skipped'` |
| Supabase TOTP | PROD-02 | ✓ enabled by default [CITED: Supabase MFA self-hosting doc] | auth-js 2.117.3 | — |

**Blocking without fallback:** none for the code. The Teller account blocks only the live REM-03 proof.

## Validation Architecture

| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.3; projects `web` (jsdom), `worker-node`, `workerd` (`@cloudflare/vitest-plugin` 1.4.0) |
| Config | `app/vitest.config.ts`, `app/worker/vitest.config.ts` |
| Quick run | `pnpm -C app test` |
| Full suite | `pnpm -C app check && pnpm -C app test:live && python -m unittest discover -s src/tests -v` |

### Phase Requirements → Test Map
| Req | Behavior | Type | Command / file | Exists |
|-----|----------|------|----------------|--------|
| REM-01 | due rule (status, live link, count, next_at, local hour incl. a DST date); stops at complete/revoked/expired/waiting_on_staff; 24 h progress deferral | live SQL | `pnpm -C app test:live worker/test/reminders-sql.test.ts` | ❌ W0 |
| REM-01 | claim single-winner under 5 parallel calls; next_at floor ≥20 h | live SQL | same | ❌ |
| REM-01 | no key → no-op; `Idempotency-Key = reminder-{id}-{n}`; fixed copy | unit | `worker/src/reminders/*.test.ts` | ❌ |
| REM-02 | trigger counts client/provider events only (not `client.gate_failed`, not system); `is_stuck` at N h boundary | live SQL | `worker/test/progress-trigger.test.ts` | ❌ |
| REM-03 | webhook: valid, two `v1`, `t` >180 s, tampered body, no header | unit | `worker/src/webhooks/teller.test.ts` | ❌ |
| REM-03 | Connect signature: generated Ed25519 pair + frozen sandbox fixture; wrong env/nonce reuse rejected | unit | `…/bank/teller/connect.test.ts` | ❌ |
| REM-03 | normalize from captured fixture (sign, pending, re-id removal); `DELETE /accounts` via mocked `TELLER_CERT` | unit | `…/bank/teller/transactions.test.ts` | ❌ |
| REM-03 | switch: firm setting > env; disabled with reason when secret/cert missing; old connections keep provider | unit | `…/bank/index.test.ts` | ❌ |
| REM-04 | DOB parse (`07/24/1995`, `7/4/1995`, trailing time, invalid); phone4; stable digests | unit | `worker/src/auth/identity-gate.test.ts` | ❌ |
| REM-04 | `/api/c/*` blocked before gate except state/verify; state minimal; 5th fail locks; regenerate resets; 10 parallel guesses consume 10 attempts | unit + live | `worker/test/c-verify.test.ts` | ❌ |
| PROD-01 | `use-of-data.md` statement == `consent-text.ts`; version bumped | unit | `src/lib/consent-text.test.ts` | ❌ |
| PROD-02 | aal1 → 401 `mfa_required`; aal2 → 200; `/api/admin/session` exempt; `mfa_*` events need aal2 | unit (jose test keys) | `staff-auth.test.ts` | extend |
| PROD-02 | TOTP RFC 6238 vectors | unit | `node --test app/scripts/lib/totp.test.mjs` | ❌ |
| PROD-02 | pack has every section, no secret values (regex scan), CSV escaping | unit | `worker/src/compliance/evidence.test.ts` | ❌ |
| PROD-02 | deployed password → challenge → verify → admin 200; aal1 → 401 | smoke | `node app/scripts/smoke.mjs <url> --auth` | extend |
| PROD-03 | order, idempotent rerun, secret kept on failed removal, tombstones, counts | unit | `worker/src/retention/purge-case.test.ts` | ❌ |
| PROD-03 | synthetic case: objects gone; events/consents/pushes intact | live | `worker/test/retention-live.test.ts` | ❌ |
| PROD-04 | redaction on `examples/` synthetic text leaves no SSN/ITIN/EIN/card/8+-digit/grouped digits; residue → skip | unit | `worker/src/ai/redact.test.ts` | ❌ |
| PROD-04 | body has `zdr`, `data_collection:"deny"`, `allow_fallbacks:false`, `require_parameters:true`, no `user`; non-2xx/timeout/bad JSON → skipped, log `error_code` only | unit | `worker/src/ai/openrouter.test.ts` | ❌ |
| PROD-04 | accept/dismiss never changes item status or `case_financial_data` | live SQL | `worker/test/document-ai-review.test.ts` | ❌ |

**Fixtures and fakes**
- Teller fixtures in `worker/test/fixtures/teller/`:
  - `webhook-*.json`, signed inside the test;
  - `connect-success.sandbox.json` and `transactions.sandbox.json`, captured by the spike.
- A generated Ed25519 key pair covers the logic until the spike fixtures exist.
- `rls.test.ts` gains the new columns and the RPC grants (anon gets 401).
- Fake modes:
  - `TELLER_ENV=sandbox` with no binding.
  - No `RESEND_API_KEY`: reminders paused.
  - No `OPENROUTER_API_KEY`: classification skipped.
  - The Logics fake fixture carries a `DOB`.

**Sampling**

| When | Run |
|------|-----|
| Each commit | `pnpm -C app test` |
| Each wave | `pnpm -C app check && pnpm -C app test:live` |
| Phase gate | Full suite, plus deployed `smoke --auth` and `smoke --client-flow` |

**Wave 0 gaps:**
- the Teller fixtures from the spike (they block the A1/A2 tests);
- `totp.mjs` with its test, and `enroll-demo-totp.mjs`, before AAL enforcement;
- `DOB` in the Logics fake fixture.

**Irreversible-action checkpoint:** the retention purge (D-16) is the only one-way action. Ship `RETENTION_ENABLED="false"` in the `wrangler.jsonc` vars, so `retentionTick` returns early. The plan ends with a `checkpoint:human-verify` that:
1. runs the `retention_due` preview count;
2. purges one synthetic case and inspects the bucket;
3. confirms the backup/PITR window (USER ACTION 8);
4. only then flips the var.

Never test the purge against real-tenant data.

## Security Domain

| ASVS (L1) | Applies | Control |
|-----------|---------|---------|
| V2 Authentication | yes | Supabase TOTP; Worker enforces `aal2`; logged admin-only factor reset |
| V3 Session | yes | `rs_client` re-issued with `gate:1` and link `v`, same `exp` |
| V4 Access Control | yes | `requireGatePassed`; firm-scoped `db/`; admin-only retention and MFA reset |
| V5 Validation | yes | Zod (`FirmSettings`, verify body, LLM output); raw-body webhook verification |
| V6 Cryptography | yes | WebCrypto HMAC-SHA256 / Ed25519; Phase 4 AES-GCM vault |
| V7 Logging | yes | Allowlisted logger (`error_code` only); events never carry entered values, prompts or digests |
| V8 Data Protection | yes | Purge; redaction + ZDR; stripped webhook payloads |

| Threat | STRIDE | Mitigation |
|--------|--------|-----------|
| Forwarded link used by someone else | S | Gate, 5-try lock, per-IP limit |
| Parallel guess race | E | Reserve-then-verify |
| Injected Teller token | S | Server nonce (single use) + Ed25519 with server env |
| Webhook replay/forgery | T | HMAC over `t.raw`, 180 s window, id dedup |
| aal1 token on admin API | E | `aal==='aal2'`, no off switch |
| PII to LLM | I | 3-pass redaction, fail-closed, ZDR + `data_collection:"deny"`, off by default |
| Prompt injection in document text | T | Enum-constrained schema; suggestion only; staff confirm |
| CSV formula injection | T | Cell prefixing |
| Orphaned vendor data after purge | I | Secret deleted only after confirmed removal |

## Sources

**Primary (HIGH):**
- **Teller:** teller.io/docs (`api/authentication`, `guides/connect`, `api/webhooks`, `api/account/transactions`, `api/accounts`), fetched 2026-10-11, plus cdn.teller.io/connect/connect.js.
- **Cloudflare:** developers.cloudflare.com (`bindings/mtls`, `development-testing`, `runtime-apis/web-crypto`).
- **Supabase and unpdf:** the installed `@supabase/auth-js@2.117.3` (`types.d.ts`, `GoTrueClient.js`); context7 `/supabase/supabase-js` and `/unjs/unpdf`.
- **OpenRouter:** the provider-selection, zdr and structured-outputs docs, plus the live `api/v1/endpoints/zdr`.
- **In-repo:**
  - `Logics_API_Documentation.docx.md:588,617-619,639,1031`
  - `supabase/migrations/0002_platform_foundation.sql`
  - `src/schemas/database_schema.sql:257-267`
  - `src/intake_workflow.py:60-72`
  - `src/document_parse.py:233-262`
  - `app/package.json`
  - `app/wrangler.jsonc`
- **Other:** `data-privacy-stack/presidio` US recognizers (MIT, via the GitHub API); eCFR 16 CFR 314.4 (gov index); IRS Pub 5708 Rev. 8-2024 (text extracted); the npm registry.

**Secondary (MEDIUM):** the Resend idempotency doc, the Truv link-delete doc and launch checklist, the Plaid DTM guide, and the Supabase auth-mfa and totp guides (summarized fetches).

**Tertiary (LOW):** community Teller verifiers (`AInsiders/A.Pay`, `yohanc3/steer`), used only to scope the encoding spike.

## Metadata

**Confidence:**
- Stack: HIGH. No new dependencies; versions were read from the repo and npm.
- Architecture: HIGH for reminders, the gate, MFA and the purge; MEDIUM for Teller until the spike.
- Pitfalls: HIGH. They are derived from verified schema and contract facts.

**Research date:** 2026-10-11
**Valid until:** 2026-11-10. Teller and OpenRouter's ZDR list change quickly; re-check the ZDR list at deploy.
