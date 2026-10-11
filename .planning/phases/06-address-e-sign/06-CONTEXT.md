# Phase 6: Address & E-Sign - Context

**Gathered:** 2026-10-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 6 turns the last two placeholder steps of the client portal into working steps. Both use request item kinds that Phase 2 already seeded: `address` and `signature`.

1. **Address.** The client types an address, picks a Smarty suggestion, and confirms it. The USPS-standardized address, county, county FIPS, RDI (residential or commercial), and DPV result are stored on `cases`. A manual fallback exists and is flagged unverified.
2. **E-sign.** Staff attach an e-sign template (engagement letter, Form 2848, Form 8821) to a request. The client gives ESIGN consent and signs in DocuSeal's embedded form on a phone in at most 3 taps.
   - The signed PDF and the audit-trail PDF land in the case with a sha256, through the Phase 4 webhook, queue, and reconcile framework.
   - The item then goes through Phase 3 review and Phase 5 push unchanged.
   - Staff get a copyable signing link.

Requirements: ADDR-01, SIGN-01, SIGN-02, SIGN-03, SIGN-04.

Out of scope here:
- Feeding the county into IRS standards (ADDR-02, Phase 7).
- Reminders and the identity gate (Phase 8).
- Building an Anvil integration (Anvil is evaluated only).
- Signing Form 433-A, which never happens in the portal.

</domain>

<decisions>
## Implementation Decisions

Discussion ran in `--auto` mode. For each gray area the recommended option was taken and logged at the end of this section. Vendor facts were checked on 2026-10-11 against the DocuSeal, Smarty, Anvil, IRS, and US Code pages listed in canonical_refs. Override any decision here before planning.

### Item kinds and data (carried forward)

- **D-01:** Reuse the Phase 2 `request_items.kind` values `address` and `signature`.
  - Both are already in the 0003 CHECK constraint. The "Standard resolution packet" seed already contains `{kind:'signature', config:{template:'engagement_letter'}}`.
  - Do not add new kinds. The names `address_confirm` and `esign` from the brief are superseded by Phase 2 D-06.
  - `config.template` must be one of `engagement_letter`, `form_2848`, or `form_8821`. The Worker rejects any other key. 433-A, 433-F, 656, and 9465 are never valid.
- **D-02:** Migration `supabase/migrations/0007_address_esign.sql`. 0007 is the next free number after `0006_logics_push`. It is additive and follows the house style: RLS on, grants revoked, `SECURITY INVOKER`, `SET search_path = ''`. It makes three changes:
  - **(a) New `cases` columns.** `address_line1`, `address_line2`, `city`, `state_code`, `zip5`, `zip4`, `county_name`, `county_fips`, `address_rdi`, `address_dpv`, `address_verified`, `address_source`, `address_confirmed_at`.
    - `address_rdi` is `Residential`, `Commercial`, or NULL.
    - `address_verified` is `boolean NOT NULL DEFAULT false`.
    - `address_source` is `smarty` or `manual`.
    - NULL means unknown, never `''`.
  - **(b) Widened Phase 4 CHECK constraints.** Add `'docuseal'` to `connections.provider`, `'signature'` to `connections.kind`, and `'esign'` to `consents.kind`.
  - **(c) New RPC `case_confirm_address(p_item_id uuid, p_link_id uuid, p_address jsonb)`.** In one transaction it:
    - updates the case;
    - moves the item forward-only to `submitted`;
    - logs `address.confirmed` with payload `{source, verified, county_fips, rdi}` (never street text);
    - calls `request_apply_status`.

  No new tables. — **Reversibility:** costly — Phase 7 reads these columns for the county standards lookup.

### Address step (ADDR-01)

- **D-03:** Smarty runs server-side only, using the secret key pair `SMARTY_AUTH_ID` and `SMARTY_AUTH_TOKEN`.
  - The client is a plain `fetch` module, `app/worker/src/integrations/smarty/client.ts`, about 60 lines. Do not add the Apache-2.0 SDK, per the house rule for provider clients.
  - Why both calls must go through the Worker:
    - Autocomplete Pro returns only `street_line`, `secondary`, `city`, `state`, `zipcode`, and `entries`. County, `county_fips`, and `rdi` come only from the US Street API.
    - Proxying keeps keys out of the browser.
    - It avoids the embedded-key `Referer` check, which conflicts with the portal's `Referrer-Policy: no-referrer`.
    - It needs no CSP change.
- **D-04:** Two routes, behind `clientSession` and the Phase 2 per-link rate limit (30 per minute):
  - **`GET /api/c/address/suggest?q=&selected=`** calls `https://us-autocomplete-pro.api.smarty.com/lookup` with `search`, `max_results=5`, and `selected` (used to expand `entries > 1` into units). It returns `{ suggestions: [...] }` with only those six fields.
  - **`POST /api/c/items/:itemId/address`** takes the picked suggestion and calls `https://us-street.api.smarty.com/street-address` with `match=invalid` and `candidates=1`. It maps `components`, `metadata.county_name`, `metadata.county_fips`, `metadata.rdi`, and `analysis.dpv_match_code` into `case_confirm_address`, sets `address_verified = (dpv_match_code === 'Y')`, and returns the standardized address.
- **D-05:** Client UX.
  - The `address` row opens a full-height bottom sheet (`h-dvh`). The input sits at the top so the iOS keyboard never covers it. The input uses a 16 px font so iOS does not auto-zoom (UI-SPEC input rule).
  - Suggestions appear after 3 characters, with a 250 ms debounce, as up to 5 rows of 44 px.
  - A suggestion with `entries > 1` lists its units.
  - Picking one shows a confirm card, "Is this your home address?", with the standardized address and a "Yes, that's my address" button. County is never shown as a question.
  - DPV codes `D` or `S` prompt once: "Add your apartment or unit number."
  - Build it from shadcn `Sheet`, `Input`, and `Button`. No cmdk or combobox library goes into the `/c/*` bundle.
- **D-06:** Fallback. The manual form appears when Smarty is unconfigured (secrets missing returns 503 `provider_not_configured`), when Smarty errors, or when the client taps "I can't find my address".
  - Fields: street, unit, city, a state select (50 states plus DC), and ZIP5.
  - It saves through the same RPC with `address_source='manual'`, `address_verified=false`, and county NULL.
  - Staff see an "Unverified — county unknown" chip. There is no county field anywhere (ADDR-01).
- **D-07:** Staff side.
  - An address card in the Phase 3 review panel shows the standardized address, county and FIPS, RDI, the verified chip, and the source. Approve and reject work as for any other item.
  - Phase 6 does not write `case_financial_data`. ADDR-02 maps the county into the engine in Phase 7.

### E-sign provider (SIGN-01)

- **D-08:** Use DocuSeal Cloud US (`https://api.docuseal.com`, header `X-Auth-Token`) in Test Mode for the demo. Not self-hosted, and not Anvil.
  - **Why Cloud:**
    - PROJECT.md and REQUIREMENTS.md lock "DocuSeal first".
    - Cloud has no operations work. Self-hosting the AGPL Rails app on Cloudflare Containers would need external Postgres and object storage.
    - Test Mode is free and uses a separate API key.
    - Production is billed per completed document (about $0.20), which fits the pay-as-you-go budget. Anvil is about $1.50 per packet.
  - **Boundaries:** No DocuSeal source code is copied (AGPL). All DocuSeal calls live in one module, `app/worker/src/integrations/esign/`:
    - `docuseal.ts`: `listTemplates`, `getTemplate`, `createSubmission`, `getSubmission`
    - `ingest.ts`: artifact download and storage
  - No provider interface until a second provider is chosen.
- **D-09:** Anvil is evaluated, not built. A time-boxed task runs Anvil's Etch embedded demo and the DocuSeal embed side by side on a phone against the SIGN-04 test. It records tap count, zoom, scroll, and white-label notes in the phase SUMMARY. Any swap is a later decision; the D-08 module boundary keeps it cheap.
- **D-10:** Secrets and variables.
  - Secrets: `DOCUSEAL_API_KEY` and `DOCUSEAL_WEBHOOK_SECRET`, provisioned through `provision-secrets.mjs --provider` over stdin.
  - Variables: `DOCUSEAL_API_URL=https://api.docuseal.com` and `DOCUSEAL_ENV=test`.
  - `DOCUSEAL_ENV` is copied into `connections.data.env`. Staff see a "Test" badge on test-signed documents, like Phase 5's "Simulated" badge.
  - If the key is missing, the sign routes return 503 `provider_not_configured`. The client step reads "Your agent will send this form another way" and the staff item reads "E-sign not set up".

### Templates (SIGN-01)

- **D-11:** A person builds templates once in the DocuSeal console (Test Mode first). There is no embedded builder and no code-created template.
  - **Template contract:** exactly one signer role. Fields named `Full name` and `Case ID` (read-only prefill), an optional `Address`, one `Signature`, and an auto `Date`.
  - **Firm mapping:** the firm maps keys to template ids in `firms.settings.esign_templates`, for example `{engagement_letter: 123, form_2848: null, form_8821: null}`. The mapping is edited in a small admin-only "E-sign templates" card on Settings → Integrations, which lists `GET /templates` in one select per key.
  - **Request builder:** the Phase 2 builder gains "Add a form to sign". It lists only mapped keys and adds a `signature` item with `config.template`.
- **D-12:** Submissions are created lazily: the first time the client opens the sign step after consenting.
  - **Request:** `POST /submissions` with:
    - `template_id`, `send_email:false`, `send_sms:false`;
    - `expire_at` set to the client link's `expires_at`;
    - one submitter with the template's role, name, email, and `external_id` = the `request_items.id`;
    - `values` and `readonly_fields` for prefill, containing only fields the template actually has.
  - **Storage:** the submission is a Phase 4 `connections` row:
    - `provider 'docuseal'`, `kind 'signature'`
    - `external_id` = submission id, `link_ref` = submitter slug
    - `data` = `{template_key, template_id, submitter_id, env}`
    - status `pending`
  - **Reuse and retry:** the row is reused on every later open. A declined or expired submission ends in `error`, and the next open creates a new row.
  - `embed_src` is fetched on demand. It is never stored and never shown to staff.

  — **Reversibility:** costly — signatures share the Phase 4 status rank, reconciler, and webhook routing. That sharing is the reason for the choice: no second state machine.

### Client signing UX and the 3-tap test (SIGN-04)

- **D-13:** Tap budget from a fresh link:
  1. `Start` (Phase 2 intro)
  2. the signature row's `Sign` button
  3. `I agree` on the ESIGN consent sheet, which opens the signing page with the signature field active

  The D-17 deep link opens the sign step automatically after Start, so a copied signing link takes 2 taps.

  How the first field becomes the signature:
  - Prefilled read-only fields make the signature the first required field.
  - `DocusealForm` props: `expand`, `goToLast`, `onlyRequiredFields`, `withTitle={false}`, `withSendCopyButton={false}`, `sendCopyEmail={false}`, `language="en"`, and `allowTypedSignature` left at its default of true (typing a name is easiest for seniors).
  - `src` is the submitter's `embed_src`, so no email step appears.
- **D-14:** Signing renders on its own full-bleed portal route, `app/src/routes/c/sign.$itemId.tsx`.
  - It is not inside the 30 rem client card or a sheet, which avoids nested scrolling. A sticky 44 px "Back to your steps" header sits on top.
  - `@docuseal/react@1.0.75` (MIT) is lazy-imported on this route only, per the bundle rule.
  - The viewport stays `width=device-width, initial-scale=1`. Never set `maximum-scale`.
  - `onComplete` calls Phase 4 `POST /api/c/connections/:id/reconcile`, then returns to the step list with "Signed. Your agent has it."
  - **Proof:**
    - Playwright at 390×844 counts taps and asserts `scrollWidth <= innerWidth`.
    - Real iPhone Safari and Android Chrome runs are a held-out manual check.
- **D-15:** The `/c/*` CSP (Phase 4 `middleware/client-csp.ts`) adds the DocuSeal origins the embed loads. The expected set is `https://cdn.docuseal.com` for script and `https://docuseal.com` for connect, frame, and img. The researcher confirms the exact list from the package source before planning.

### ESIGN consent (SIGN-03)

- **D-16:** Reuse the Phase 4 `consents` table with `kind='esign'`, `ConsentSheet`, and `CONSENT_TEXT.esign` (version `esign-v1`) in `app/src/lib/consent-text.ts`.
  - The unique key `(link_id, kind, text_version)` means one consent covers every form sent through that link.
  - `consentKindForItem('signature')` returns `'esign'`. The event is `consent.esign`.
  - **Consent text** covers the 15 U.S.C. 7001(c)(1) items:
    - the right to a paper copy, and how to get it (call your agent, no fee);
    - the right to withdraw consent, and what that means;
    - the scope: forms sent through this link;
    - how to update contact details;
    - device requirements: a phone or computer with a current browser that shows PDFs.

    Tapping "I agree" in the same interface used to sign is the "reasonably demonstrates" step.
  - **Server enforcement:** `POST /api/c/items/:itemId/signature/start` returns 409 `consent_required` when no matching consent row exists. The embed URL never reaches the browser before consent.
  - The text is a draft for counsel (USER ACTION).

### Copyable signing link (SIGN-03)

- **D-17:** "Copy signing link" is the request's existing client link plus `?step=<itemId>`.
  - It is never DocuSeal's `embed_src` or `/s/{slug}` URL. That way expiry, revoke, rate limits, consent, and the staff mirror all still apply.
  - Phase 1 `routes/client-link.ts` forwards a UUID-validated `step` to `/c/?step=<itemId>`, and the portal opens that step after Start.
  - Email reuses Phase 2 Resend. Text stays a copy action: no own SMS, and no DocuSeal SMS or email.

### Webhook, ingest, status (SIGN-02)

- **D-18:** A `docusealAdapter` joins Phase 4 `webhooks/adapters.ts`, served on `POST /api/webhooks/docuseal`. Widen the `WebhookAdapter.id` union to include it.
  - **Verification:**
    - Header format: `X-Docuseal-Signature: <ts>.<hex>`.
    - The hex is HMAC-SHA256 with `DOCUSEAL_WEBHOOK_SECRET` over `${ts}.${rawBody}`.
    - Reject if `|now-ts|` is over 300 s. Compare in constant time.
  - **Event key:** `${event_type}:${data.id}:${timestamp}`.
  - **Subscribed events:** `form.viewed`, `form.started`, `form.completed`, `form.declined`.
  - **Effect of each event:**
    - Viewed and started only log `esign.viewed` or `esign.started` through `connection_record_event`, for the mirror and timeline. They do not change status, because `connected` would mark the item submitted.
    - Completed moves the connection to `done`.
    - Declined moves it to `error`.
- **D-19:** The consumer never trusts the payload. `reconcileSignature` is a new branch in Phase 4 `jobs/reconcile.ts`, also run by the 15-minute cron through `listNonTerminalConnections(env,'signature')` and by staff Refresh. It calls `GET /submissions/{id}`. When the submitter is completed, it:
  1. downloads every `documents[].url` and the `audit_log_url` in the same job (the URLs are short-lived; keep the submission id, never the URLs);
  2. computes sha256 in the Worker;
  3. stores the files in `case-documents` under the Phase 3 path layout;
  4. inserts `documents` rows:
     - `document_type` `signed_document` or `esign_audit_log`;
     - `connection_id`, `request_item_id`;
     - `status ready`, `uploaded_by_actor 'provider'`;
     - idempotent: skip when a row with the same `connection_id` and `sha256` exists;
  5. calls `connection_set_status('done')`, which moves the item to `submitted` and recomputes the request status.

  Staff approve it like any item. The signed PDF goes through Phase 5 push unchanged.

### Staff view, forms scope, demo safety

- **D-20:** A signature card on the request page shows:
  - the template name;
  - a status chip: Waiting, Viewed, Signing, Signed, or Declined (from the status plus the last `esign.*` event);
  - "Copy signing link";
  - the signed PDF and audit PDF as Phase 3 document rows;
  - Refresh, and the "Test" badge.

  `form_2848` and `form_8821` items carry a fixed note: "E-signed copies must be submitted online at IRS.gov/Submit2848 or IRS.gov/Submit8821, and you must authenticate the client's identity for a remote signature." Form 433-A is never offered.
- **D-21:** Demo setup:
  - DocuSeal Test Mode with a synthetic "Engagement letter (demo)" template.
  - `send_email`, `send_sms`, and `sendCopyEmail` all false, so DocuSeal never emails or texts anyone.
  - A public test address for Smarty.
  - Logics push in Phase 5 fake mode.

  Phase 6 is the roadmap's nice-to-have. Without keys, both steps show their honest fallback states and are presented as "coming next".

### Claude's Discretion

- Exact copy within the UI-SPEC voice.
- Suggestion row layout.
- The Smarty error threshold that triggers the fallback.
- The `Sign` versus `Review and sign` button label.
- Cron batch size for signature reconcile.
- How the template signer role is cached (read from `GET /templates/{id}`).

### Auto-selection log

- [auto] Provider: Cloud, self-hosted on Containers, or Anvil → **DocuSeal Cloud Test Mode**; Anvil evaluated only.
- [auto] Templates: console-built, embedded builder, or API from PDF → **console-built, mapped per firm**.
- [auto] Mobile embed: React component, raw iframe, or redirect → **`@docuseal/react` on a full-bleed route**.
- [auto] Signing link: DocuSeal URL or our deep link → **client link plus `?step=`**.
- [auto] Consent record → **Phase 4 `consents`, kind `esign`**.
- [auto] Signature state: new `signatures` table or Phase 4 `connections` → **`connections`**.
- [auto] Smarty calls: browser embedded key or Worker proxy → **Worker proxy, secret keys**.
- [auto] Missing Smarty keys → **manual entry, flagged unverified, county NULL**.
- [auto] Item kinds → **Phase 2 `address` and `signature`**.
- [auto] Migration number → **0007**.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Prior phases (build on them, do not re-decide)

- **Phase 1**
  - `.planning/phases/01-foundation-staff-sign-in/01-CONTEXT.md`: D-11 (`firms.settings`), D-17/D-18 (link token, cookie exchange), D-19/D-20 (sandbox banner, logger).
  - `.planning/phases/01-foundation-staff-sign-in/01-07-PLAN.md`: the `routes/client-link.ts` redirect.
  - `.planning/phases/01-foundation-staff-sign-in/01-UI-SPEC.md`: 44 px targets, 16 px minimum, input 16 px rule, `Button size="xl"`.
- **Phase 2**
  - `.planning/phases/02-find-the-client-send-the-link/02-CONTEXT.md`: D-06 (item kinds and seeds), D-09 (Resend), D-11 (step list), D-15 (routes).
  - `.planning/phases/02-find-the-client-send-the-link/02-01-PLAN.md`: 0003 CHECK constraint and template seed.
  - `.planning/phases/02-find-the-client-send-the-link/02-08-PLAN.md`: `step-list.tsx`, `step-copy.ts`, `ComingNextSheet`.
- **Phase 3**
  - `.planning/phases/03-uploads-review-live-status/03-CONTEXT.md`: D-01 (storage path layout), D-04 (`documents` columns), D-05 (review), D-06 (`request_status`).
  - `.planning/phases/03-uploads-review-live-status/03-02-PLAN.md`: `UploadSheet`.
  - `.planning/phases/03-uploads-review-live-status/03-03-PLAN.md`: review panel.
- **Phase 4**
  - `.planning/phases/04-connect-payroll-bank/04-CONTEXT.md`: D-01..D-04 (webhook, queue, reconcile), D-12 (consents), D-14 (0005), D-15 (secret provisioning), D-16 (CSP).
  - `.planning/phases/04-connect-payroll-bank/04-01-PLAN.md`: `WebhookAdapter`, `connections`/`consents` DDL, `connection_set_status`, `status_rank`.
  - `.planning/phases/04-connect-payroll-bank/04-03-PLAN.md`: `client-csp.ts`, the consents route.
  - `.planning/phases/04-connect-payroll-bank/04-05-PLAN.md`: `ConsentSheet`, `CONSENT_TEXT`, `consentKindForItem`, the step-sheet pattern.
- **Phase 5**
  - `.planning/phases/05-push-to-logics/05-CONTEXT.md`: any `documents` row is pushable; fake mode; the "Simulated" badge.

### Project and research

- `.planning/PROJECT.md`: the Address and E-sign bullets under "What Andrew asked for", and the DocuSeal and Copy-only-MIT Key Decisions.
- `.planning/REQUIREMENTS.md`: ADDR-01, SIGN-01..04, WEBH-01, and the Out of Scope row "Signing the official Form 433-A".
- `.planning/ROADMAP.md`: Phase 6.
- `.planning/STATE.md`: the Phase 6 blocker (counsel decides which forms may be e-signed).
- `.planning/Client/call1.md`:
  - lines 147-153: Smarty and county
  - line 358: e-sign pain ("only sends an email, I can't copy the link... zoom in and scroll")
  - lines 437-452: Anvil, DocuSeal, Documenso
- `.planning/research/PITFALLS.md`: C13 (e-sign persistence, consent, IRS form acceptance), C4 (webhooks), C2 (bearer link).
- `.planning/research/ARCHITECTURE.md`: the DocuSeal sequence and webhook table.
- `.planning/research/FEATURES.md`: §(e) E-Signature.
- `.planning/research/STACK.md`: versions and the licensing table.
- `.planning/research/SUMMARY.md`: conflict 2 (licensing).
- Rules: `CLAUDE.md`, `.claude/CLAUDE.md`, `.agents/skills/supabase/SKILL.md`, `.agents/skills/supabase-postgres-best-practices/SKILL.md`.

### Vendor and legal sources (checked 2026-10-11)

- **DocuSeal**
  - API: https://www.docuseal.com/docs/api — `X-Auth-Token`; `api.docuseal.com` and `api.docuseal.eu`; `POST /submissions`, `GET /submissions/{id}`, `GET /templates`.
  - Embedded form props: https://www.docuseal.com/docs/embedded/form/react
  - React guide (`embed_src`, `slug`): https://www.docuseal.com/guides/embed-document-signing-into-react-app
  - Webhook HMAC: https://www.docuseal.com/resources/use-webhooks
  - `form.completed` payload: https://www.docuseal.com/guides/download-signed-documents
  - Test Mode: https://www.docuseal.com/resources/use-test-mode
  - Pricing: https://www.docuseal.com/signing-api
- **Smarty**
  - Autocomplete Pro: https://www.smarty.com/docs/apis/us-autocomplete-pro-api/reference
  - US Street: https://www.smarty.com/docs/apis/us-street-api/reference (`county_name`, `county_fips`, `rdi`, `dpv_match_code`, `match`)
- **Anvil Etch (evaluation):** https://www.useanvil.com/docs/api/e-signatures/ (`generateEtchSignUrl`, `AnvilEmbedFrame`)
- **ESIGN Act:** 15 U.S.C. 7001(c), https://uscode.house.gov/view.xhtml?req=(title:15%20section:7001%20edition:prelim)
- **IRS e-signature rules for 2848 and 8821:**
  - https://www.irs.gov/tax-professionals/submit-forms-2848-and-8821-online
  - https://www.irs.gov/instructions/i8821 (e-signed copies are online-only; remote signing needs identity authentication)

### Repositories and packages (stars and licenses verified 2026-10-11 with `gh api` and `npm view`)

| Repo or package | Stars | License | Use |
|---|---|---|---|
| `docusealco/docuseal` | 18,691 | AGPL-3.0 | Hosted service only; never copy code |
| `docusealco/docuseal-react` → `@docuseal/react@1.0.75` | 69 | MIT | Embed component; copy usage |
| `docusealco/docuseal-js` → `@docuseal/api@1.0.25` | 7 | MIT | Request and response shapes only; plain `fetch` |
| `documenso/documenso` | 15,381 | AGPL-3.0 | Visual reference only |
| `anvilco/react-ui` → `@anvilco/anvil-embed-frame@2.2.2` | 19 | MIT | Anvil evaluation only |
| `anvilco/node-anvil` → `@anvilco/anvil@3.3.2` | 20 | MIT (npm) | Anvil evaluation only |
| `smarty/smartystreets-javascript-sdk@13.1.0` | 37 | Apache-2.0 | Field shapes only; plain `fetch` |

No Smarty autocomplete UI repo with meaningful stars exists (the only hit had 0 stars), so build it from the in-repo shadcn parts (MIT).

</canonical_refs>

<code_context>
## Existing Code Insights

The app is at Phase 1 plan 3. `app/worker/src/{index.ts, log/, routes/config.ts, integrations/logics/}` exist. Everything listed below from Phases 2-5 exists only as plans; build on those planned files and names.

### Reusable Assets

- **Phase 4:**
  - Webhook framework: `webhooks/adapters.ts` and `types.ts`, `routes/webhooks.ts`.
  - Reconcile and queue: `jobs/reconcile.ts`, `jobs/index.ts`, `cron.ts`, `routes/admin-connections.ts` (Refresh), `routes/c-connections.ts` (consents, reconcile).
  - Data: `db/connections.ts`, `db/consents.ts`, `storage/connection-files.ts`.
  - Client: `features/client-portal/connect/consent-sheet.tsx`, `lib/consent-text.ts`, `middleware/client-csp.ts`, `integrations/configured.ts`.
- **Phase 3:** `storage/case-documents.ts`, `db/documents.ts`, `features/review/*` (review panel, document rows), `features/uploads/upload-sheet.tsx`, `lib/status.ts`, `components/status-badge.tsx`, `features/timeline/labels.ts`.
- **Phase 2:** `features/client-portal/{step-list,step-copy,portal-page}.tsx`, `use-heartbeat.ts`, `middleware/{client-session,link-rate-limit}.ts`, `features/requests/request-page.tsx` and the builder, `features/settings/integrations/*`, `integrations/email/resend.ts`.
- **Phase 1:** `routes/client-link.ts`, `logEvent`, the allowlisted logger, `provision-secrets.mjs`, `db-migrate.mjs`, `check-file-sizes.mjs`.

### Established Patterns

- Every write is an RPC that logs its event.
- Status is derived in SQL, and connection status moves monotonically.
- The webhook route verifies the raw body, records the event, enqueues it, and returns 200. The consumer re-reads provider state.
- An unconfigured provider returns 503 and the step falls back honestly.
- Type guards at API boundaries; kebab-case file names; named exports.
- Every code file has a companion doc under `docs/`; no file over 500 lines.
- `/c/*` rules: no text under 16 px, 44 px targets, no analytics.

### Integration Points

- **Worker (new):** `integrations/smarty/client.ts`, `routes/c-address.ts`, `integrations/esign/{docuseal,ingest}.ts`, `webhooks/docuseal.ts`, `jobs/signature-reconcile.ts`, `routes/c-signature.ts`, `routes/admin-esign.ts` (template list and firm map).
- **Worker (edits):** `webhooks/adapters.ts`, `jobs/reconcile.ts`, `cron.ts`, `routes/client-link.ts` (`step`), `middleware/client-csp.ts`, the consents kind validation.
- **SPA (new):** `features/client-portal/address/*`, `features/client-portal/sign/*`, `routes/c/sign.$itemId.tsx`, `features/review/{address-card,signature-card}.tsx`, `features/settings/integrations/esign-templates-card.tsx`.
- **SPA (edits):** `step-list.tsx`, `step-copy.ts`, `lib/consent-text.ts`, the request builder ("Add a form to sign"), `timeline/labels.ts` (`address.confirmed`, `consent.esign`, `esign.viewed`, `esign.started`).
- **SQL:** `supabase/migrations/0007_address_esign.sql`, plus additions to `app/worker/test/rls.test.ts` if needed (no new tables).

</code_context>

<specifics>
## Specific Ideas

- **Andrew on the address step:** "type in your home address... it auto-suggests like, did you mean this? Yes. They click it... You can now skip the whole county you live in." Smarty is "post office verified and validated" and gives "the county according to the post office."
- **Andrew on e-sign:** the Logics e-sign "only sends an email. I can't copy the link... you have to zoom in and scroll." He wants "the email, has the texting, gives them a link." Anvil is his favorite because a friend sold hearing aids to seniors over the phone with it. That story is the origin of the "senior on the phone" test.
- **Demo path:**
  1. The Standard resolution packet's address step uses a public test address, and the county and RDI appear on the staff card.
  2. The engagement letter (test template) is signed on a phone in at most 3 taps, using a typed signature.
  3. Within seconds, the signed PDF and audit PDF appear with sha256 values and a "Test" badge.
  4. The item is approved and then pushed in Logics fake mode.
- **Research must verify these assumptions before planning:**
  - **A1:** Autocomplete Pro accepts the secret key pair server-side. Fallback: the Worker sends the embedded key with a `Referer` set to the Worker host.
  - **A2:** DocuSeal fires webhooks in Test Mode. The reconcile path covers it if not.
  - **A3:** DocuSeal accepts a `values` subset and `readonly_fields` by field name.
  - **A4:** The exact DocuSeal CSP origins.
  - **A5:** How long DocuSeal document URLs stay valid (research says about 40 minutes; download in the same job regardless).

</specifics>

<deferred>
## Deferred Ideas

- Anvil adapter, only if the D-09 evaluation clearly wins.
- Self-hosted DocuSeal on Cloudflare Containers, for data residency (Phase 8 or later).
- Embedded `DocusealBuilder` for in-app template building.
- DocuSeal-sent SMS or email, `require_phone_2fa`, and the identity step-up (Phase 8, REM-04).
- Joint or spouse co-signers (multi-role submissions).
- One-tap "use the address on file" from the Logics `CaseInfo` snapshot.
- Locking the sign step until the address step is done.
- Automating the IRS online submission of e-signed 2848 and 8821 forms.
- County into `case_financial_data` and the standards lookup (ADDR-02, Phase 7).
- Timezone from the Smarty address for reminder quiet hours (Phase 8).

</deferred>

<user_actions>
## USER ACTION Required

1. **DocuSeal (Zack):**
   1. Create a docuseal.com account (US cloud) and switch to Test Mode.
   2. Create a test API key and enter it as `DOCUSEAL_API_KEY` through `provision-secrets.mjs --provider`.
   3. Add a webhook at `https://resspark.<subdomain>.workers.dev/api/webhooks/docuseal` for `form.viewed`, `form.started`, `form.completed`, and `form.declined`.
   4. Turn on Security → HMAC and enter that secret as `DOCUSEAL_WEBHOOK_SECRET`.
   5. Build "Engagement letter (demo)" with one signer role and the fields `Full name`, `Case ID`, `Address` (optional), `Signature`, and `Date`.
2. **Smarty (Zack):** Create a smarty.com account (free trial), generate a secret key pair with US Autocomplete Pro and US Street access, and enter `SMARTY_AUTH_ID` and `SMARTY_AUTH_TOKEN`.
3. **ValorTax counsel (via Andrew):**
   - Which forms may be e-signed: engagement or fee agreement, 2848, 8821.
   - Review the ESIGN consent text (`esign-v1`), and any state disclosure rules for tax-resolution contracts.
   - Confirm ValorTax will submit e-signed 2848 and 8821 forms online and how it authenticates identity for remote signing.
   - Form 433-A stays out of the portal.
4. **Andrew:**
   - Upload the real ValorTax engagement letter and the official 2848 and 8821 PDFs as DocuSeal templates once counsel approves.
   - Accept DocuSeal production pricing (per completed document, on top of the plan) before switching off Test Mode.
   - Optionally share an Anvil dev account for the D-09 comparison.
5. **Real-device check:** Run the 3-tap test on an iPhone (Safari) and an Android phone (Chrome).

</user_actions>

---

*Phase: 06-address-e-sign*
*Context gathered: 2026-10-11*
