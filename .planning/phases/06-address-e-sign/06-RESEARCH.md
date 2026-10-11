# Phase 6: Address & E-Sign - Research

**Researched:** 2026-10-11
**Domain:** Smarty address verification over a Worker proxy; DocuSeal Cloud embedded signing, webhook and reconcile; ESIGN consent; mobile Playwright
**Confidence:** HIGH for vendor API shapes (read from DocuSeal's live OpenAPI file, the `@docuseal/react@1.0.75` tarball, DocuSeal's `form.js`, and the Smarty reference pages). MEDIUM for UX and test harness choices.

## Summary

Most of CONTEXT.md holds up against the primary sources, but six details are wrong or missing and change the plans:

1. **No `readonly_fields` parameter on `POST /submissions`.** Read-only prefill goes in `submitters[].fields[]` as `{ name, default_value, readonly: true }`. `values` (keyed by field name) does exist. A3 is partly refuted.
2. **`POST /submissions` returns an array of submitters, not a submission.** Read `[0].submission_id` (this becomes `connections.external_id`), `[0].slug` (`link_ref`), `[0].id` (`data.submitter_id`), and `[0].embed_src`. `GET /submitters/{id}` returns a fresh `embed_src` and the submitter's status. That is the on-demand fetch D-12 asks for.
3. **`DocusealForm` is not an iframe.** It renders a `<docuseal-form>` custom element with an open shadow root. It loads `https://cdn.docuseal.com/js/form.js`, which lazy-loads chunks from `https://docuseal.com/js/` and calls `fetch` against the origin of `src` (`https://docuseal.com`). The CSP therefore needs `script-src` with both hosts, plus `connect-src` and `font-src https://docuseal.com`. It needs no `frame-src`. A4 is resolved, and D-15 and ARCHITECTURE.md's "needs frame-src" are corrected.
4. **Webhook HMAC is confirmed exactly as D-18 states:** `X-Docuseal-Signature: <unix-seconds>.<hex>`, HMAC-SHA256 over `${ts}.${rawBody}`, 300 s tolerance. However, `crypto.subtle.timingSafeEqual` does not exist in Node (the `worker-node` test project), so verify with `crypto.subtle.verify('HMAC', …)`. It is constant-time, and I tested it working in Node 24. The `form.*` payload's `data.id` is the **submitter** id. Route by `data.submission_id`.
5. **Smarty secret keys work for Autocomplete Pro server-side.** Smarty's official SDK example uses `BasicAuthCredentials` for "server-to-server" Autocomplete Pro (A1 resolved). Send `prefer_geolocation=none`, because the default geolocates the caller's IP, which would be the Worker's.
6. **Playwright is not installed.** The `iPhone 13` descriptor uses WebKit and a 390×664 viewport (screen 390×844). WebKit is not on this machine (only Chromium builds are), and `@playwright/test@1.64.0` is 4 days old (flagged `SUS`, too new).

Document URLs expire after 40 minutes by default and return 404 afterwards (A5 resolved). DocuSeal does not document whether webhooks fire in Test Mode (A2 unresolved). The client `onComplete` reconcile and the 15-minute cron cover that case regardless.

**Primary recommendation:** Build the phase as one Phase 4 provider, `docuseal` with kind `signature`, plus one stateless Smarty proxy. Use the verified request and response shapes in this file, not the CONTEXT shorthand. Stub `form.js` in Playwright for the tap test, and prove CSP plus a real embed against the deployed sandbox URL.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
D-01..D-21 in `.planning/phases/06-address-e-sign/06-CONTEXT.md` are locked. They are copied here by reference to stay under the size budget; the planner must read that file in full. Short index (exact wording governs):
- **D-01** Reuse Phase 2 kinds `address` and `signature`; `config.template` ∈ `engagement_letter|form_2848|form_8821`; 433-A/433-F/656/9465 never valid.
- **D-02** `0007_address_esign.sql`: 13 `cases` address columns; widen `connections.provider` (+`docuseal`), `connections.kind` (+`signature`), `consents.kind` (+`esign`); RPC `case_confirm_address(p_item_id, p_link_id, p_address jsonb)`; no new tables.
- **D-03** Smarty server-side only, secret pair `SMARTY_AUTH_ID`/`SMARTY_AUTH_TOKEN`, plain `fetch` client `integrations/smarty/client.ts` (~60 lines), no SDK.
- **D-04** `GET /api/c/address/suggest?q=&selected=` and `POST /api/c/items/:itemId/address`; US Street `match=invalid`, `candidates=1`; `address_verified = (dpv_match_code === 'Y')`.
- **D-05** Full-height bottom sheet, 16 px input, 3-char/250 ms debounce, 5 rows × 44 px, units list for `entries > 1`, confirm card, DPV `D`/`S` prompt once; shadcn `Sheet`/`Input`/`Button`; no cmdk in `/c/*`.
- **D-06** Manual fallback (503 `provider_not_configured`, Smarty error, "I can't find my address"): street, unit, city, state select (50 + DC), ZIP5; `address_source='manual'`, `verified=false`, county NULL; "Unverified — county unknown" chip.
- **D-07** Staff address card in the Phase 3 review panel; no `case_financial_data` writes.
- **D-08** DocuSeal Cloud US, `X-Auth-Token`, Test Mode; all calls in `integrations/esign/{docuseal,ingest}.ts`; no provider interface; no AGPL code copied.
- **D-09** Anvil evaluated only (time-boxed side-by-side, results in SUMMARY).
- **D-10** Secrets `DOCUSEAL_API_KEY`, `DOCUSEAL_WEBHOOK_SECRET`; vars `DOCUSEAL_API_URL`, `DOCUSEAL_ENV=test`; "Test" badge; 503 `provider_not_configured` fallbacks.
- **D-11** Console-built templates; one signer role; fields `Full name`, `Case ID` (read-only prefill), optional `Address`, `Signature`, auto `Date`; `firms.settings.esign_templates`; admin-only Settings card; builder "Add a form to sign".
- **D-12** Lazy submission on first open after consent; `send_email:false`, `send_sms:false`, `expire_at` = link expiry, `external_id` = item id; stored as a `connections` row (`docuseal`/`signature`, `external_id` = submission id, `link_ref` = slug); reuse; `error` → new row next open; `embed_src` never stored.
- **D-13** Tap budget Start → Sign → I agree; deep link = 2 taps; `DocusealForm` props listed there.
- **D-14** Full-bleed route `app/src/routes/c/sign.$itemId.tsx`, sticky 44 px header, lazy `@docuseal/react@1.0.75`, no `maximum-scale`; `onComplete` → `POST /api/c/connections/:id/reconcile`; Playwright 390-wide + manual devices.
- **D-15** CSP adds DocuSeal origins (researcher confirms list — see Q4 below).
- **D-16** `consents` kind `esign`, `CONSENT_TEXT.esign` version `esign-v1`, 15 U.S.C. 7001(c)(1) items; `POST /api/c/items/:itemId/signature/start` → 409 `consent_required`.
- **D-17** Copy link = client link + `?step=<itemId>`; `routes/client-link.ts` forwards a UUID-validated `step`.
- **D-18** `docusealAdapter` on `POST /api/webhooks/docuseal`; header/HMAC/300 s; event key `${event_type}:${data.id}:${timestamp}`; viewed/started log only; completed → `done`; declined → `error`.
- **D-19** `reconcileSignature` in `jobs/reconcile.ts` (+cron, +Refresh): `GET /submissions/{id}`, download all docs + audit log in the same job, sha256, store, `documents` rows, `connection_set_status('done')`.
- **D-20** Staff signature card (status chip from status + last `esign.*` event, copy link, PDFs, Refresh, Test badge); 2848/8821 IRS note.
- **D-21** Demo: Test Mode template, all DocuSeal emails/SMS off, public Smarty test address, Logics fake mode.

### Claude's Discretion
Exact copy within the UI-SPEC voice; suggestion row layout; the Smarty error threshold that triggers the fallback; `Sign` vs `Review and sign`; cron batch size for signature reconcile; how the template signer role is cached (read from `GET /templates/{id}`).

### Deferred Ideas (OUT OF SCOPE)
Anvil adapter; self-hosted DocuSeal on Containers; embedded `DocusealBuilder`; DocuSeal-sent SMS/email, `require_phone_2fa`, identity step-up (Phase 8); joint/spouse co-signers; "use the address on file" from Logics; locking sign until address is done; automating IRS online submission of 2848/8821; county into `case_financial_data` (ADDR-02, Phase 7); timezone from the address (Phase 8).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ADDR-01 | Smarty autocomplete; USPS-validated address, county, residential/commercial stored on the case | Q1 Smarty shapes (Autocomplete Pro fields, US Street `components`/`metadata`/`analysis`), Pattern 1, migration in Pattern 5 |
| SIGN-01 | Staff attach e-sign template; client signs embedded on a phone; DocuSeal first, Anvil evaluated | Q2 `POST /submissions` real schema, `GET /templates` (`shared` param), Pattern 2 |
| SIGN-02 | Signed PDF + audit PDF stored with hash; item signed; pushable to Logics | Q3 `GET /submissions/{id}` shape, 40-min URL TTL, Pattern 4 (`storeProviderFile` reuse) |
| SIGN-03 | Copyable signing link; ESIGN consent before signing | 15 U.S.C. 7001(c)(1) text (Sources), consent widening, D-17 redirect edit (Pitfall 9) |
| SIGN-04 | ≤ 3 taps to first signature field, no zoom or horizontal scroll; agent sees the step | Q4 embed behavior and props (`allowToResubmit`, `customCss`), Playwright plan (Validation), `esign.viewed/started` events |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- TypeScript for all frontend code; named exports; kebab-case files; type guards at every API boundary (no casting untrusted JSON).
- No code file over 500 lines (`app/scripts/check-file-sizes.mjs`); every code file gets a companion Markdown doc under `docs/` that mirrors the source path, kept in sync.
- Ponytail: the smallest complete change; no speculative abstraction (D-08's "no provider interface" honors this).
- Supabase: RLS on every table; grants revoked from `anon`/`authenticated`; `SECURITY INVOKER`; `SET search_path = ''`; load `.agents/skills/supabase*` before SQL work.
- Secrets stay server-side; signed short-lived URLs; audit log; never send raw documents to an LLM.
- Distinguish NULL (unknown) from 0/`''`; unknown required values block rather than default (D-02's "NULL never `''`").
- Form 433-A is never signed in the portal; IRS rules need an authoritative source and tests.
- The GSD workflow governs edits; Phase 6 does not touch `src/determination.py` or the standards.
- Copy only MIT code (PROJECT.md key decision): `@docuseal/react` (MIT) is used as a dependency; DocuSeal app code (AGPL) is never copied or self-hosted here.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Address suggestions and verification | API / Backend (Worker → Smarty) | Browser (debounced input) | Secret keys and the `county`/`rdi` fields exist only server-side (D-03) |
| Address persistence and item status | Database (`case_confirm_address` RPC) | — | One transaction: case + item + event + request status |
| E-sign submission creation | API / Backend (Worker → DocuSeal) | Database (`connections` row) | API key server-side; row before URL (Phase 4 pattern) |
| Signing UI | Browser (`<docuseal-form>` custom element from DocuSeal's CDN) | — | Vendor component; our route only frames it |
| Webhook verify and dedupe | API / Backend (`routes/webhooks.ts`) | Database (`webhook_events`) | Existing Phase 4 path |
| Artifact download, hash, store | Worker queue consumer (`reconcileSignature`) | Storage (`case-documents`) | URLs expire in 40 min; the job owns the fetch |
| ESIGN consent | API / Backend (consents route) | Database (`consents`) | The server gate blocks `signature/start` without a row |
| Copy signing link | API / Backend (`routes/client-link.ts` `step` forward) | Browser (deep-link open) | Keeps expiry, revoke, consent, and rate limits |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@docuseal/react` | 1.0.75 (published 2026-05-13, MIT) [VERIFIED: npm registry + tarball read] | `DocusealForm` embed | The vendor's component; 6 KB wrapper that injects `cdn.docuseal.com/js/form.js` |
| DocuSeal Cloud REST API | OpenAPI 3.1 at `https://console.docuseal.com/openapi.json` [VERIFIED: fetched] | Templates, submissions, submitters | Locked (D-08); plain `fetch` with `X-Auth-Token` |
| Smarty US Autocomplete Pro | `https://us-autocomplete-pro.api.smarty.com/lookup` [CITED: smarty.com/docs/apis/us-autocomplete-pro-api/reference] | Suggestions | Locked (D-04) |
| Smarty US Street | `https://us-street.api.smarty.com/street-address` [CITED: smarty.com/docs/apis/us-street-api/reference] | County, FIPS, RDI, DPV | Locked (D-04) |
| Web Crypto (`crypto.subtle`) | platform | HMAC verify, sha256 | Exists in Workers and Node ≥ 22; no dependency |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@playwright/test` | **1.63.0** (2026-09-04) recommended; 1.64.0 is 4 days old [VERIFIED: npm registry time] | 3-tap mobile test | New devDependency in `app/`; first Playwright use in the repo |
| Existing: `hono`, `zod`, shadcn `Sheet`/`Input`/`Button`/`Select`, TanStack Router | as pinned in `app/package.json` | Routes, guards, UI | Already installed; no new runtime dependency besides `@docuseal/react` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@docuseal/react` | Raw `<docuseal-form>` + `<script>` | Same behavior; the wrapper is 6 KB and gives typed props/events — keep it |
| Autocomplete Pro | Smarty's newer "US Autocomplete" API | Smarty says Pro "is still a current product but is not the latest version" [CITED: Pro reference page]; Pro is locked by D-04 — revisit only if Pro is retired |
| `crypto.subtle.timingSafeEqual` | `crypto.subtle.verify('HMAC')` | `timingSafeEqual` is Workers-only (undefined in Node 24 — verified locally); `verify` is constant-time and portable |

**Installation:**
```bash
pnpm -C app add @docuseal/react@1.0.75
pnpm -C app add -D @playwright/test@1.63.0
pnpm -C app exec playwright install chromium   # webkit optional, see Environment
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@docuseal/react` | npm | 1.0.75 published 5 months ago | 279,763/wk | github.com/docusealco/docuseal-react | OK (no postinstall) | Approved |
| `@playwright/test` | npm | 1.64.0 published 4 days ago | 75,270,945/wk | github.com/microsoft/playwright | SUS (`too-new`) | Pin **1.63.0** (5 weeks old); if 1.64.0 is wanted, the planner adds `checkpoint:human-verify` |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `@playwright/test@1.64.0` (flagged only because the release is new). Use 1.63.0 instead.
Neither package has a `postinstall` script (checked with `npm view … scripts.postinstall` and the seam). Both names come from vendor docs: DocuSeal's embedding docs, and STACK.md for Playwright.

## Vendor Facts (answers to the research questions)

### Q1. Smarty
- **Auth (A1 resolved).** A secret key pair is sent either as `auth-id`/`auth-token` query parameters or as the header `Authorization: Basic base64(id:token)`. Secret keys are not host-limited and "should not be embedded or exposed in HTML or JavaScript" [CITED: smarty.com/docs/account/authentication]. Smarty's own Autocomplete Pro example sets up a "Server-to-server" client with `BasicAuthCredentials(authId, authToken)` [CITED: github.com/smarty/smartystreets-javascript-sdk examples/us_autocomplete_pro.mjs]. Use the header form so the token never appears in a URL.
- **Autocomplete Pro request** (`GET /lookup`):
  - `search` is required, **max 32 characters**.
  - `max_results` is 1–10 (default 10).
  - `selected` expands secondaries. Its format is `street_line secondary (entries) city state zipcode`, for example `1042 W Center St Apt (108) Orem UT 84057`, and it returns up to 100 entries.
  - `prefer_geolocation` defaults to `city`, which uses the **sender's IP**. Through a proxy you must forward `X-Forwarded-For` or set `none`. Use `none` and do not forward the client IP.

  [CITED: Pro reference]
- **Autocomplete Pro response:** `{ suggestions: [{ street_line, secondary, city, state, zipcode, entries }] }`. `source` appears only when the `source` input is set. Status codes: 401 (key or referer), 402 (no subscription), 400, 422, 429 (rate), 200 [CITED: Pro reference].
- **US Street request** (`GET /street-address`):
  - Component fields: `street`, `secondary` (max 32), `city`, `state`, `zipcode`, `candidates` (default 1, max 10), and `match` (`strict` by default).
  - `match=invalid` returns output for invalid addresses too. It "isn't compatible with freeform address input" (freeform silently becomes strict), and for component input it "will prevent the API from finding valid matches for ambiguous address input".
  - Some inputs return `[]` regardless of `match`.

  [CITED: US Street reference]
- **US Street response:**
  - It is an array of candidates with `delivery_line_1`, `delivery_line_2`, `last_line`, `components{primary_number, street_name, street_suffix, secondary_designator, secondary_number, city_name, default_city_name, state_abbreviation, zipcode, plus4_code}`, `metadata{county_fips char(5), county_name varchar(64), rdi 'Residential'|'Commercial'|blank, zip_type, …}`, and `analysis{dpv_match_code, dpv_footnotes, dpv_vacant, …}`.
  - **"Only non-blank fields will be returned."** Map an absent field to NULL.
  - **DPV codes:** `Y` means confirmed. `S` means the main address is confirmed but the secondary was not recognized. `D` means the main address is confirmed but the secondary is missing. Blank means not present in USPS data. Smarty says "Values of Y, S, or D indicate a valid address". D-04's `verified = (dpv === 'Y')` is a stricter, deliberate choice.
  - PO Boxes are always `Residential`.
  - Status codes: 401, 402, 413 (32 KB body), 400 (a GET without `street`), 422, 429, 200.

  [CITED: US Street reference]
- **Free trial:** 42 days with 1,000 lookups per product. For autocomplete, lookups are counted **per keystroke request** [CITED: smarty.com/pricing, smarty.com/pricing/us-address-autocomplete search snippets]. At 3 characters and 250 ms debounce, one address costs about 5–12 suggest calls plus 1 Street call, so the trial covers about 80 demo entries.

### Q2. DocuSeal API (from `console.docuseal.com/openapi.json`)
- **Servers and auth:** `https://api.docuseal.com` (Global) and `https://api.docuseal.eu`; header `X-Auth-Token` [VERIFIED: openapi.json].
- **`POST /submissions` body:**
  - Top level: `template_id` (required), `send_email` (default **true**), `send_sms` (default false), `order`, `completed_redirect_url`, `expire_at` (string), `variables`, `message`, and `submitters[]` (required).
  - Submitter fields: `name`, `role`, `email`, `phone` (E.164), `values` ("Use field names for keys"), `external_id`, `completed`, `metadata`, `send_email`, `send_sms`, `completed_redirect_url`, `order`, `require_phone_2fa`, `require_email_2fa`, `invite_by`, `message`, `fields[]` (`name` required, `default_value`, **`readonly`**, `required`, `title`, `description`, `validation`, `preferences`), and `roles`.
  - **No `readonly_fields` key exists.** That name is only the embed prop `readonlyFields`.

  [VERIFIED: openapi.json schema dump]
- **`POST /submissions` 200 response** is an **array** of submitters: `[{ id, submission_id, uuid, email, slug, sent_at, opened_at, completed_at, declined_at, created_at, updated_at, name, phone, external_id, metadata, status, values, preferences, role, embed_src: "https://docuseal.com/s/{slug}" }]` [VERIFIED: openapi.json example].
- **`GET /submissions/{id}`** returns `{ id, slug, status: completed|declined|expired|pending, audit_log_url, combined_document_url, completed_at, expire_at, submitters[{ id, slug, status, completed_at, declined_at, external_id, values, documents[{name,url}], role }], template{id,name}, submission_events[], documents[{ name, url }] }` [VERIFIED: openapi.json].
- **`GET /submitters/{id}`** returns the submitter with `status` (`completed|declined|opened|sent|awaiting`), `documents[]`, and `embed_src` (per the schema's required list) [VERIFIED: openapi.json].
- **`GET /templates`** takes `q`, `slug`, `external_id`, `folder`, `archived`, `shared` ("List templates shared with test mode"), `limit` (default 10, **max 100**), `after`, and `before`. The response is `{ data: [...], pagination }`. `GET /templates/{id}` → `{ id, name, fields[{ uuid, submitter_uuid, name, type, required }], submitters[{ name, uuid }], documents[] }` [VERIFIED: openapi.json].
- **Webhook events** (`webhooks` section): `form.viewed|started|completed|declined`, plus `submission.*` and `template.*`. Payload `{ event_type, timestamp: "2023-09-24T11:20:42Z", data: FormData }`. In FormData, `id` is **the submitter id**, along with `submission_id`, `external_id`, `status`, `documents[]`, `audit_log_url`, `submission{ id, audit_log_url, combined_document_url, status, url }`, `decline_reason`, `ip`, `ua`, and others [VERIFIED: openapi.json].
- **HMAC:** the header `X-Docuseal-Signature` has the format `[timestamp].[signature]`, and the signed content is `[timestamp].[raw_body]`. DocuSeal's own example rejects requests when `|Date.now()/1000 − timestamp| > 300` and compares the hex digests in constant time. The secret is the `whsec_…` string, used as-is as the key. Verify against the exact raw bytes [CITED: docuseal.com/resources/use-webhooks]. I reproduced this locally: a Node `createHmac` signature verifies with `crypto.subtle.verify`, and a single flipped bit fails.
- **URL lifetime (A5 resolved):** "Document URLs returned by the API and webhooks are temporary and expire after 40 minutes by default. After expiration, these URLs will return a 404 error." Store `submission_id`, never the URL [CITED: docuseal.com/guides/download-signed-documents].
- **Test Mode:** a separate isolated account with separate API keys. Production templates appear in Test Mode only after "Share template with Test Mode", and edits made in test mode reflect in production [CITED: docuseal.com/resources/use-test-mode]. **A2 (webhooks fire in Test Mode) is not stated anywhere.** It stays UNRESOLVED.
- **Pricing:** test API and embedding are free and unlimited. Production costs $0.20 per completed document and requires at least one Pro seat at $20/month [CITED: docuseal.com/signing-api].

### Q3. `@docuseal/react@1.0.75` and `form.js` (read from the tarball and the live CDN file)
- **Exports:** `export { DocusealForm, DocusealBuilder }` from `dist/index.d.ts` [VERIFIED: tarball]. There are no `peerDependencies`. The package was built against React 18 types and uses only `createElement` and hooks; React 19 should work [ASSUMED].
- **How it renders:** the component appends `<script id="docuseal-form-script" src="https://${host}/js/form.js">` (default `host = "cdn.docuseal.com"`) and renders `<docuseal-form data-src=… data-…>`. It listens for the DOM events `completed`, `init`, `declined`, and `load` [VERIFIED: `dist/index.esm.js`].
- **form.js internals** [VERIFIED: `cdn.docuseal.com/js/form.js`, 548 KB]:
  - It defines a custom element that calls `attachShadow({mode:"open"})` and injects a `<style>`. It does **not** create an iframe.
  - The base URL is the origin of `src` (`url(){ return this.src.match(/^https?:\/\/[^/]+/)[0] }`), and the slug is the last path segment.
  - It `fetch`es `${base}/s/{slug}/…`, `/embed/forms`, `/api/attachments`, and `/s/{slug}/upload` (signature images).
  - It loads the typed-signature font with `new FontFace(… url(${base}/fonts/DancingScript-Regular.otf))`.
  - Its webpack public path is `https://docuseal.com/js/`, so lazy chunks load from there. `https://docuseal.com/js/766-1ba36522e118c36b24b0.js` returns 200.
  - `new Function` appears only in a `globalThis` fallback, so `unsafe-eval` should not be needed [ASSUMED from reading; confirm with the live CSP check].
  - When `form.sandbox` is true it renders a "Developer Sandbox. Upgrade to start using in Production." banner with a link.
- **Prop defaults that matter** [VERIFIED: tarball destructuring]:
  - `expand = true`, `goToLast = true`, `withTitle = true`, `withDecline = false`, `withDownloadButton = true`, `withSendCopyButton = true`, `allowTypedSignature = true`, `reuseSignature = true`, and **`allowToResubmit = true`**.
  - `sendCopyEmail` is left undefined unless passed.
  - With an `/s/` src, a completed form shows a **Resubmit** button for 14 days, and it POSTs `/embed/forms`, which creates a new submission ResSpark would not track. **Pass `allowToResubmit={false}`.**
  - `customCss` is injected into the shadow root as a `<style>`. Use it to force 16 px inputs.
- **CSP needed for `/c/*` (A4 resolved):** `script-src https://cdn.docuseal.com https://docuseal.com`, `connect-src https://docuseal.com`, and `font-src https://docuseal.com`. `img-src` already allows `https:` (page preview images), and `style-src 'unsafe-inline'` is already present. **No `frame-src` is needed.** For EU hosting, swap in `docuseal.eu` (not in scope).

### Q4. IRS 2848/8821 e-signature rules
- "For forms submitted online, we accept these types of electronic signature: Typed name…; Scanned or digitized image…; Handwritten signature input onto an electronic signature pad…; … stylus…; Signature created by a third-party software. We don't accept electronically signature for forms by fax or mail… must have a 'wet' ink signature" [CITED: irs.gov/tax-professionals/submit-forms-2848-and-8821-online].
- "Forms 2848 with an electronic signature image or digitized image of a handwritten signature may only be submitted to the IRS online at IRS.gov/Submit2848" [CITED: irs.gov/instructions/i2848, rev. 09/2021].
- **Remote signing:** the third party "must attest that he or she has authenticated the taxpayer's identity". That means inspecting a government photo ID against a selfie or video, recording the name, SSN or ITIN, address, and DOB, and verifying them through secondary documents. There is an exception where the third party has personal knowledge [CITED: i2848; same list on the submit page].
- **One form per upload:** "If you submit more than one form, the other forms won't be processed" [CITED: submit page].
- Form 2848 also carries the **representative's** Part II declaration and signature ("Have all parties sign") [CITED: submit page]. A one-role template covers only the taxpayer (see Open Questions).

## Architecture Patterns

### System Architecture Diagram
```
Phone (/c/*)                         Worker (Hono)                                Vendors / DB
───────────                          ─────────────                                ────────────
address sheet ─GET /api/c/address/suggest──▶ clientSession → allowInWindow(30/min) ─▶ Smarty Autocomplete Pro
   │ pick                                                                                (Basic auth, geoloc none)
   └─POST /api/c/items/:id/address──▶ guard body → Smarty US Street (components, invalid, 1)
                                       └─▶ rpc case_confirm_address ─▶ cases + request_items + events + request_apply_status
                                       (Smarty 503/err/[] → client shows manual form → same RPC, source=manual)

Sign row ─POST /api/c/consents{esign}─▶ consents row + consent.esign event
   └─POST /api/c/items/:id/signature/start─▶ consent gate (409) → configured gate (503)
          → latest connection for item? reuse (GET /submitters/{sid} → embed_src, status)
          → else GET /templates/{tid} (role, field names) → insertConnection(pending) → POST /submissions
          → updateConnection(external_id=submission_id, link_ref=slug, data) → return { connection_id, embed_src }
   └─ /c/sign/$itemId: <DocusealForm src=embed_src> ─(cdn.docuseal.com/js/form.js ⇄ docuseal.com)─▶ DocuSeal
          onComplete → POST /api/c/connections/:id/reconcile (202) → JOBS.send(reconcile)

DocuSeal ─POST /api/webhooks/docuseal─▶ docusealAdapter.verify(HMAC, ±300 s) → recordWebhook(dedupe) → JOBS.send → 200
Queue consumer / 15-min cron / staff Refresh ─▶ reconcileSignature(conn)
          → GET /submissions/{id} → completed? download documents[] + audit_log_url NOW (40-min TTL)
          → sha256 → storeProviderFile(kind 'signature') → documents rows → connection_set_status('done')
          → item submitted → Phase 3 review → Phase 5 push (unchanged)
          viewed/started → connection_record_event('esign.viewed'|'esign.started') only
          declined/expired → connection_set_status('error', {code})
```

### Recommended Project Structure (new files only; edits listed in CONTEXT `code_context`)
```
app/worker/src/integrations/smarty/client.ts      # suggest(), verifyStreet(), smartyConfigured()
app/worker/src/integrations/esign/docuseal.ts     # dsFetch, listTemplates, getTemplate, createSubmission, getSubmission, getSubmitter
app/worker/src/integrations/esign/ingest.ts       # download + storeProviderFile for signed/audit PDFs
app/worker/src/webhooks/docuseal.ts               # docusealAdapter
app/worker/src/jobs/signature-reconcile.ts        # reconcileSignature
app/worker/src/routes/{c-address,c-signature,admin-esign}.ts
app/src/features/client-portal/{address,sign}/*   # sheet, suggestion list, manual form, consent wiring, sign page
app/src/routes/c/sign.$itemId.tsx
app/e2e/sign-taps.spec.ts + app/playwright.config.ts   # outside Vitest include globs
supabase/migrations/0007_address_esign.sql
```

### Pattern 1: Smarty client (plain fetch, Basic auth)
```ts
// Source: smarty.com/docs/account/authentication (Basic header), Pro + US Street references
const AC = 'https://us-autocomplete-pro.api.smarty.com/lookup'
const ST = 'https://us-street.api.smarty.com/street-address'
export const smartyConfigured = (env: Env) => Boolean(env.SMARTY_AUTH_ID && env.SMARTY_AUTH_TOKEN)
const auth = (env: Env) => ({ Authorization: 'Basic ' + btoa(`${env.SMARTY_AUTH_ID}:${env.SMARTY_AUTH_TOKEN}`) })

export async function suggest(env: Env, search: string, selected?: string) {
  const q = new URLSearchParams({ search: search.slice(0, 32), max_results: '5', prefer_geolocation: 'none' })
  if (selected) q.set('selected', selected)
  const r = await fetch(`${AC}?${q}`, { headers: auth(env) })
  if (!r.ok) throw new ProviderError('smarty', r.status, `http_${r.status}`, isTransientStatus(r.status))
  return r.json() // guard: { suggestions: Array<{street_line,secondary,city,state,zipcode,entries}> }
}
// verifyStreet: GET ST?street&secondary&city&state&zipcode&candidates=1&match=invalid → [] | [candidate]
```
- `ProviderId` in `integrations/provider-error.ts` is `'plaid'|'truv'|'teller'`. Widen it to include `'docuseal'|'smarty'`, or pass a string. Widening is the smaller and typed option.
- Map `[]` from US Street to the manual fallback ("We couldn't confirm that address"). Do not store an unverified Smarty row.

### Pattern 2: Create or reuse a submission (row before URL)
```ts
// Source: openapi.json POST /submissions (array response), GET /templates/{id}, GET /submitters/{id}
const tpl = await getTemplate(env, templateId)                    // role = tpl.submitters[0].name
const names = new Set(tpl.fields.map((f) => f.name))
const prefill = [['Full name', fullName], ['Case ID', caseRef], ['Address', addressLine]]
  .filter(([n, v]) => names.has(n) && v)                          // only fields the template has
const conn = await insertConnection(env, { ...ids, provider: 'docuseal', kind: 'signature', data: { template_key, template_id: templateId, env: env.DOCUSEAL_ENV } })
const [s] = await dsFetch(env, '/submissions', { method: 'POST', body: {
  template_id: templateId, send_email: false, send_sms: false, expire_at: link.expires_at,
  submitters: [{ role: tpl.submitters[0].name, name: fullName, email: email ?? undefined, external_id: itemId,
    send_email: false, fields: prefill.map(([name, v]) => ({ name, default_value: v, readonly: true })) }],
} }, isSubmitterArray)
await updateConnection(env, conn.id, { external_id: String(s.submission_id), link_ref: s.slug,
  data: { ...conn.data, submitter_id: s.id } })
return { connection_id: conn.id, embed_src: s.embed_src }        // never persisted
```
- **Reuse:** take `latestConnectionForItem`. If its status is `pending`, call `GET /submitters/{data.submitter_id}`. A status of `completed` means enqueue a reconcile and return `{ signed: true }`. A status of `declined`, or an `expired` submission, means `setConnectionStatus('error', {code})` and creating a new row. Otherwise return `embed_src`.
- Before rendering, the SPA checks that `embed_src` starts with `https://docuseal.com/s/`.
- `expire_at` takes an ISO string. The docs example uses `2024-09-01 12:00:00 UTC` format [ASSUMED that ISO is accepted; covered by the live test].

### Pattern 3: DocuSeal webhook adapter
```ts
// Source: docuseal.com/resources/use-webhooks; crypto.subtle.verify verified in Node 24 this session
export const docusealAdapter: WebhookAdapter = {
  id: 'docuseal',
  configured: (env) => Boolean(env.DOCUSEAL_WEBHOOK_SECRET),
  async verify(raw, headers, env) {
    const [ts, hex] = (headers.get('x-docuseal-signature') ?? '').split('.', 2)
    if (!/^\d+$/.test(ts ?? '') || !/^[0-9a-f]{64}$/i.test(hex ?? '')) return null
    if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return null
    const key = await crypto.subtle.importKey('raw', enc.encode(env.DOCUSEAL_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
    const sig = Uint8Array.from(hex.match(/../g)!.map((h) => parseInt(h, 16)))
    if (!(await crypto.subtle.verify('HMAC', key, sig, enc.encode(`${ts}.${raw}`)))) return null
    const payload = JSON.parse(raw) as Record<string, unknown>     // parse only after verify
    return isDocusealEvent(payload) ? { payload, iat: Number(ts) } : null
  },
  eventKey: (v) => `${v.payload.event_type}:${(v.payload.data as { id: number }).id}:${v.payload.timestamp}`,
}
```
- The consumer resolves the connection with `findConnectionByExternalId('docuseal', String(data.submission_id))`. If there is no row, mark the event `ignored` (it may belong to another environment or a resubmission).
- Widen `WebhookAdapter.id`, the `Job.provider` union (`'plaid'|'truv'` → add `'docuseal'`), `ProviderId`, `ConnectionKind`, and `listNonTerminalConnections(kind)`. `webhook_events.provider` already allows `docuseal` (04-01 DDL).

### Pattern 4: reconcileSignature (D-19)
- Call `GET /submissions/{external_id}` once. If `status === 'completed'`:
  1. Download every `documents[].url` and the `audit_log_url` in this job.
  2. Check the `%PDF-` magic bytes; `storeProviderFile` already does this.
  3. Compute sha256.
  4. Store at `firm/F/case/C/item/I/signature/{submission_id}/{name}.pdf` and `…/audit-log.pdf`.
- **Reuse Phase 4's `storeProviderFile`.** Widen its `kind: 'bank'|'payroll'` to include `'signature'`. It is already idempotent on `storage_key`, and a deterministic path gives the D-19 idempotency without a new query. Use `document_type` values `signed_document` and `esign_audit_log`, and `actor: 'provider:docuseal'`, which matches Phase 4's `provider:truv` convention (see Contradictions).
- If the status is completed but `documents` is empty or `audit_log_url` is null, throw a transient `ProviderError` so the queue retries. Do not set `done` [ASSUMED: generation may lag completion].
- Status `declined` or `expired` → `setConnectionStatus('error', { code })`. Status `pending` → `recordConnectionEvent` only, and only when the latest `submission_events` entry is new.

### Pattern 5: Migration 0007 shape
```sql
-- House style from 0002 (read this session): BEGIN/COMMIT, RLS, revoke, SECURITY INVOKER, search_path ''
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS address_line1 text, ADD COLUMN IF NOT EXISTS address_line2 text,
  ADD COLUMN IF NOT EXISTS city text, ADD COLUMN IF NOT EXISTS state_code text CHECK (state_code ~ '^[A-Z]{2}$'),
  ADD COLUMN IF NOT EXISTS zip5 text CHECK (zip5 ~ '^\d{5}$'), ADD COLUMN IF NOT EXISTS zip4 text CHECK (zip4 ~ '^\d{4}$'),
  ADD COLUMN IF NOT EXISTS county_name text, ADD COLUMN IF NOT EXISTS county_fips text CHECK (county_fips ~ '^\d{5}$'),
  ADD COLUMN IF NOT EXISTS address_rdi text CHECK (address_rdi IN ('Residential','Commercial')),
  ADD COLUMN IF NOT EXISTS address_dpv text CHECK (address_dpv IN ('Y','N','S','D')),
  ADD COLUMN IF NOT EXISTS address_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS address_source text CHECK (address_source IN ('smarty','manual')),
  ADD COLUMN IF NOT EXISTS address_confirmed_at timestamptz;
-- Widen Phase 4 inline CHECKs. Inline column checks get Postgres default names <table>_<column>_check [ASSUMED];
-- the executor confirms with: SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid IN ('public.connections'::regclass,'public.consents'::regclass) AND contype='c';
ALTER TABLE public.connections DROP CONSTRAINT IF EXISTS connections_provider_check,
  ADD CONSTRAINT connections_provider_check CHECK (provider IN ('plaid','truv','teller','docuseal'));
ALTER TABLE public.connections DROP CONSTRAINT IF EXISTS connections_kind_check,
  ADD CONSTRAINT connections_kind_check CHECK (kind IN ('bank','payroll','signature'));
ALTER TABLE public.consents DROP CONSTRAINT IF EXISTS consents_kind_check,
  ADD CONSTRAINT consents_kind_check CHECK (kind IN ('bank_data','payroll_data','esign'));
```
`case_confirm_address` uses plpgsql, `SECURITY INVOKER`, and `SET search_path = ''`. It runs these steps:
1. Select the link (`client_links`) and its `request_id`. Raise `link_inactive` if the link is revoked or expired.
2. Select the item `FOR UPDATE` with `request_id` matching and `kind = 'address'`. Raise `item_not_found` otherwise.
3. If the item is `approved`, raise `item_approved`.
4. Validate `p_address->>'source'` ∈ (`smarty`, `manual`). For `manual`, require `verified = false` and NULL county and FIPS.
5. Update `cases` through `requests.case_id`, setting `address_confirmed_at = now()`.
6. Update the item to `submitted` when its status is in (`pending`, `in_progress`, `rejected`), and clear `rejection_note`.
7. Call `PERFORM public.log_event(firm, case, request, 'client', 'link:'||p_link_id, 'address.confirmed', jsonb_build_object('source',…,'verified',…,'county_fips',…,'rdi',…))`. Never include street text.
8. Return `{ item_status, request_status: public.request_apply_status(request_id) }`.

Grants follow 0002 lines 132–136: `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated; GRANT EXECUTE … TO service_role`. Revoking from PUBLIC also removes the Worker's implicit grant [VERIFIED: 0002_platform_foundation.sql:132-136 "With PUBLIC revoked, the Worker's role needs an explicit grant"].

### Pattern 6: Sign route
```tsx
// Source: @docuseal/react 1.0.75 dist/index.d.ts (named export) + prop defaults read from dist/index.esm.js
const DocusealForm = lazy(() => import('@docuseal/react').then((m) => ({ default: m.DocusealForm })))
<DocusealForm src={embedSrc} withTitle={false} onlyRequiredFields withSendCopyButton={false}
  sendCopyEmail={false} allowToResubmit={false} language="en"
  customCss="input,textarea,select{font-size:16px!important}"
  onComplete={() => reconcileConnection(connectionId).finally(() => navigate({ to: '/c/', search: { signed: itemId } }))} />
```
`expand` and `goToLast` already default to `true`; pass them explicitly only for readability.

### Anti-Patterns to Avoid
- **Calling Smarty from the browser:** this would leak keys and trip the `Referer` check, because `/c/*` sends `no-referrer`.
- **Storing DocuSeal URLs or `embed_src`:** URLs die in 40 minutes, and `embed_src` is a bearer signing credential.
- **Trusting the webhook body:** the consumer always re-reads `GET /submissions/{id}`.
- **Setting `connected` for viewed or started:** it would mark the item submitted (D-18).
- **Freeform US Street input with `match=invalid`:** Smarty silently falls back to strict. Send components.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Signing UI, signature pad, audit trail | A canvas pad or PDF stamping | DocuSeal embed and its audit log | Legal evidence (IP, UA, timestamps) is generated by the vendor |
| Address normalization and county lookup | A ZIP→county table | Smarty US Street `metadata.county_fips` | ZIPs cross county lines; USPS DPV data |
| HMAC compare | String `===` | `crypto.subtle.verify` | Constant-time; portable to Node tests |
| Idempotent artifact store | A new dedupe query | Phase 4 `storeProviderFile` (unique `storage_key`) | Already handles races and magic bytes |
| Status machine | A `signatures` table | Phase 4 `connections` and `connection_set_status` | Monotonic rank, events, request status (D-12) |
| Rate limit | A new limiter | Phase 2 `allowInWindow(key, 30, 60_000)` | The default link limiter is 20/60 s, and D-04 wants 30 |

## Common Pitfalls

### Pitfall 1: The Resubmit button creates untracked submissions
**What goes wrong:** After signing, the embed shows "Resubmit" for 14 days and POSTs `/embed/forms`, creating a new submission that has no `connections` row.
**Avoid:** Pass `allowToResubmit={false}`. A unit test asserts the rendered `data-allow-to-resubmit="false"`.

### Pitfall 2: CSP blocks DocuSeal lazy chunks or the signature font
**What goes wrong:** Allowing only `cdn.docuseal.com` loads `form.js`, but then chunks from `docuseal.com/js/`, `fetch`es, and the typed-signature font all fail.
**Avoid:** Add `script-src https://cdn.docuseal.com https://docuseal.com`, `connect-src https://docuseal.com`, and `font-src https://docuseal.com`. **Warning sign:** `securitypolicyviolation` events. `clientCsp` skips `localhost` and `127.0.0.1`, so only the deployed sandbox URL can prove it (smoke step).

### Pitfall 3: iOS zoom inside the shadow DOM
**What goes wrong:** Our 16 px rule cannot reach the embed's shadow root, so a typed-signature input under 16 px makes Safari zoom on focus.
**Avoid:** Use `customCss` to force `font-size:16px` on inputs. Playwright reads the computed font size through the open shadow root, and the manual iPhone check remains.

### Pitfall 4: Webhook replay and duplicate processing
**Avoid:** Use the 300 s window, the unique `(provider, event_key)` ledger, a consumer that re-reads state, and `connection_set_status` idempotency. A replayed `form.completed` is a duplicate key, so it returns 200 and does nothing.

### Pitfall 5: Expired document URLs
**What goes wrong:** If the queue retries after 40 minutes, a stored URL returns 404.
**Avoid:** Re-fetch `GET /submissions/{id}` on every attempt and never persist URLs (A5).

### Pitfall 6: `timingSafeEqual` is missing in Node tests
**What goes wrong:** `crypto.subtle.timingSafeEqual` is undefined in Node 24 (verified), so `worker-node` tests crash.
**Avoid:** Use `crypto.subtle.verify`. Phase 4's Truv adapter, as planned, uses `timingSafeEqual`; check how its tests run before copying it.

### Pitfall 7: Smarty geolocation and the 32-character limit
**What goes wrong:** The default `prefer_geolocation=city` ranks addresses near the Cloudflare edge first, and a `search` longer than 32 characters gets a 422 or is truncated.
**Avoid:** Send `prefer_geolocation=none` and stop sending at 32 characters. Keep the input's value, and let the user pick or tap "I can't find my address".

### Pitfall 8: DocuSeal emails the client anyway
**What goes wrong:** `send_email` defaults to **true**, and `sendCopyEmail` defaults to sending signed copies.
**Avoid:** Set `send_email:false` at the submission and submitter level, `send_sms:false`, `sendCopyEmail={false}`, and `withSendCopyButton={false}`. Account-level notification settings may still apply [ASSUMED]. As a USER ACTION, check the DocuSeal console's notification settings.

### Pitfall 9: The deep link breaks Phase 1 tests
**What goes wrong:** `client-link.test.ts` asserts that `Location` is exactly `/c/`.
**Avoid:** Forward only `step` matching the UUID regex (`/c/?step=<uuid>`), and update the Phase 1 test in the same task. Anything else redirects to `/c/` unchanged.

### Pitfall 10: The Test Mode banner in the demo
**What goes wrong:** The embed shows "Developer Sandbox. Upgrade…" with an external link a senior might tap.
**Avoid:** Mention it in the demo script. It goes away with a production key.

### Pitfall 11: Treating an e-signed 2848 or 8821 like any upload
**Avoid:** Show the D-20 note. The IRS accepts e-signed 2848 and 8821 forms only through the online tool, one form per submission, with identity authentication for remote signing (Q4). Form 433-A is never offered.

### Pitfall 12: Playwright specs picked up by Vitest
**Avoid:** Put specs in `app/e2e/*.spec.ts`, which Vitest's include globs `src/**/*.test.*` and `worker/**/*.test.ts` never match, and give them their own `playwright.config.ts`. Add a `test:e2e` script.

## Contradictions with 06-CONTEXT.md (planner must apply)

1. **D-12 `readonly_fields`.** That key is not a `POST /submissions` parameter. Use `submitters[0].fields[{ name, default_value, readonly: true }]` for read-only prefill. `values` stays valid for editable prefill.
2. **D-12 response.** `POST /submissions` returns a submitters array. The submission id is `[0].submission_id`. Get `embed_src` "on demand" from `GET /submitters/{submitter_id}` (which also returns the status needed for reuse); keep `submitter_id` in `data` as D-12 already says.
3. **D-15 CSP.** The expected set "`docuseal.com` for … frame" is wrong. There is no iframe, `script-src` needs `https://docuseal.com` as well as `https://cdn.docuseal.com`, and `font-src https://docuseal.com` is required.
4. **D-13 props.** Add `allowToResubmit={false}` and `customCss` for 16 px inputs. `expand` and `goToLast` are already the defaults.
5. **D-18 routing.** `data.id` in `form.*` events is the submitter id. Route by `data.submission_id`; the event key may keep `data.id`.
6. **D-19 actor.** CONTEXT says `uploaded_by_actor 'provider'`, but Phase 4 uses `'provider:<id>'`. Use `'provider:docuseal'`. Idempotency comes from the deterministic `storage_key`, not a `(connection_id, sha256)` query.
7. **D-04 Smarty.** Add `prefer_geolocation=none` and the 32-character `search` cap. Treat a US Street `[]` result as the D-06 fallback trigger.
8. **D-14 viewport.** Playwright's `iPhone 13` viewport is 390×664 (screen 390×844) and defaults to WebKit. A plain `{ width: 390, height: 844 }` viewport on Chromium matches CONTEXT's numbers.

## Code Examples

### Signed webhook fixture helper (tests)
```ts
// Source: docuseal.com/resources/use-webhooks signing rule
export async function signDocuseal(raw: string, secret: string, ts = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${raw}`)))
  return `${ts}.${[...mac].map((b) => b.toString(16).padStart(2, '0')).join('')}`
}
```

### Playwright tap test (stubbed embed)
```ts
// Source: Playwright device descriptors read from playwright-core 1.64.0 coreBundle.js
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
test('first signature field in ≤ 3 taps', async ({ page }) => {
  await page.route('https://cdn.docuseal.com/js/form.js', (r) => r.fulfill({ contentType: 'application/javascript', body: FAKE_FORM_JS }))
  await page.route('**/api/c/**', mockPortalApi)          // state, start, consents, signature/start
  let taps = 0; const tap = async (l: Locator) => { taps++; await l.tap() }
  await page.goto('/c/')
  await tap(page.getByRole('button', { name: 'Start' }))
  await tap(page.getByRole('button', { name: /sign/i }))
  await tap(page.getByRole('button', { name: 'I agree' }))
  await expect(page.locator('docuseal-form [data-testid="signature-field"]')).toBeVisible()
  expect(taps).toBeLessThanOrEqual(3)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
```
`FAKE_FORM_JS` defines a `docuseal-form` element with an open shadow root containing a signature field, and it dispatches `completed` when that field is tapped. The real embed is covered by the opt-in live run and the manual devices.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Smarty US Autocomplete (Basic) | Autocomplete Pro, and now a newer "US Autocomplete" | Pro page says it is "not the latest version" | Pro is still current; locked by D-04 |
| DocuSeal shared-secret header | HMAC `X-Docuseal-Signature` | Current docs | D-18 matches |
| `iframe` embeds | `docuseal-form` custom element with a shadow root | `@docuseal/react` 1.0.x | CSP is `script`/`connect`/`font`, not `frame` |

**Deprecated/outdated:** ARCHITECTURE.md's "DocusealForm (needs frame-src)" and its "Smarty browser key restricted by referer". D-03 supersedes the latter.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Inline CHECK names are `connections_provider_check`, `connections_kind_check`, `consents_kind_check` | Pattern 5 | `DROP IF EXISTS` no-ops and the `ADD` duplicates or conflicts. The executor queries `pg_constraint` first |
| A2 | DocuSeal webhooks fire in Test Mode | Q2 | Signing still completes through `onComplete` reconcile and the cron; staff see the update up to 15 minutes later |
| A3 | `expire_at` accepts an ISO 8601 string | Pattern 2 | 422 on create. The live test covers it; fall back to `YYYY-MM-DD HH:MM:SS UTC` |
| A4 | `form.js` needs no `unsafe-eval` and no hosts beyond docuseal.com and cdn.docuseal.com | Q3 | The embed fails on the deployed URL. The smoke check catches CSP violations |
| A5 | React 19 works with `@docuseal/react` (built for React 18, no peer dependencies) | Stack | Render error. The wrapper is 6 KB, so a raw `<docuseal-form>` fallback is trivial |
| A6 | Signed documents and the audit log may lag `completed` | Pattern 4 | Retry costs one queue cycle |
| A7 | DocuSeal account notification settings may still email signers | Pitfall 8 | A demo email to a synthetic address. USER ACTION to check |
| A8 | An omitted submitter `email` is accepted (the schema does not require it) | Pattern 2 | 422. Pass the request's `contact_email`, which exists on synthetic cases |

## Open Questions

1. **A1 Smarty secret key for Autocomplete Pro:** RESOLVED. Smarty's SDK example uses `BasicAuthCredentials` server-to-server, and secret keys are not host-limited.
2. **A2 webhooks in Test Mode:** UNRESOLVED. Not documented. Recommendation: rely on `onComplete` reconcile and the cron, and record the observed behavior in the SUMMARY after the first live test.
3. **A3 `values`/`readonly_fields`:** RESOLVED, partly refuted. Use `fields[].readonly`; `values` keyed by field name is valid.
4. **A4 CSP origins:** RESOLVED from the package source. Add the deployed-URL check for residual risk.
5. **A5 URL lifetime:** RESOLVED. 40 minutes by default, then 404.
6. **The representative's signature on Form 2848:** UNRESOLVED and needs counsel. A one-role template captures only the taxpayer, and Part II needs the representative. Recommendation: the representative signs Part II outside the portal for now (multi-role is deferred). Show this in the D-20 note.
7. **Where staff create the webhook in Test Mode:** UNRESOLVED. The Console has a Test Mode toggle for API keys; the webhook page may have one too. Recommendation: USER ACTION, create the webhook with the Console in Test Mode.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | Build/tests | ✓ | v24.14.0 (engines ≥ 22.12) | — |
| pnpm | Install/scripts | ✓ | 10.32.1 | — |
| Playwright Chromium binaries | e2e | ✓ (cached `ms-playwright/chromium-1243` etc.) | — | `playwright install chromium` |
| Playwright WebKit | `iPhone 13` default browser | ✗ | — | Chromium with a 390×844 viewport; real iPhone manual check |
| `@playwright/test` package | e2e | ✗ (not in `app/package.json`) | — | Install 1.63.0 |
| DocuSeal Test Mode account and key | SIGN-* live tests/demo | ✗ (USER ACTION) | — | 503 `provider_not_configured` fallback (D-10) |
| Smarty trial secret pair | ADDR-01 live | ✗ (USER ACTION) | — | Manual form (D-06) |
| Supabase project, `db-migrate.mjs` | 0007 | ✓ (0002 applied; 0003–0006 still plans) | — | Phase 6 runs after Phases 2–5 execute |

**Missing dependencies with no fallback:** none block the code. The live proof of SIGN-02 needs the DocuSeal key.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.3 (`web` jsdom, `worker-node`), plus `@playwright/test` 1.63.0 (new) |
| Config file | `app/vitest.config.ts`; new `app/playwright.config.ts` (Wave 0) |
| Quick run command | `pnpm -C app vitest run --project worker-node worker/src/webhooks/docuseal.test.ts worker/src/integrations/smarty/client.test.ts` |
| Full suite command | `pnpm -C app check && pnpm -C app test:live && pnpm -C app test:e2e` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ADDR-01 | Suggest proxy: Basic header, `prefer_geolocation=none`, 32-character cap, only 6 fields returned, 503 when unconfigured, 429 after 30/min | unit (worker-node, `fetch` stubbed) | `vitest run --project worker-node worker/src/routes/c-address.test.ts` | ❌ Wave 0 |
| ADDR-01 | US Street mapping: fixture → county, FIPS, RDI, DPV; absent fields → NULL; `[]` → `address_unverifiable` | unit | `… worker/src/integrations/smarty/client.test.ts` | ❌ |
| ADDR-01 | `case_confirm_address`: case columns written, item `submitted`, event payload has no street text, `approved` → error, wrong link → error, manual forces NULL county | live (`test:live`) | `pnpm -C app test:live` (`address-live.test.ts`) | ❌ |
| ADDR-01 | Sheet: 3-char/250 ms debounce, units expansion, D/S prompt once, manual form (51 states), 16 px input | web (jsdom) | `vitest run --project web src/features/client-portal/address` | ❌ |
| SIGN-01 | `createSubmission` body: `send_email:false`, `send_sms:false`, `expire_at`, role from template, `fields[].readonly` only for present field names, `external_id` = item; reuse path calls `GET /submitters/{id}` | unit | `… worker/src/integrations/esign/docuseal.test.ts` | ❌ |
| SIGN-01 | Template key gate: rejects 433-A and unknown keys; admin-only settings route | unit | `… worker/src/routes/admin-esign.test.ts` | ❌ |
| SIGN-02 | Webhook: valid signature → 200 and a ledger row; tampered byte, stale ts (>300 s), or missing header → 401; replay → 200 and no second row | unit plus live | `… worker/src/webhooks/docuseal.test.ts`, `routes/webhooks.test.ts` | ❌ |
| SIGN-02 | `reconcileSignature`: completed fixture → 2 `documents` rows with sha256, deterministic keys, `done`, item `submitted`; rerun creates no new rows; empty docs → transient retry; declined → `error` | live with DocuSeal stubbed | `pnpm -C app test:live` (`signature-reconcile.test.ts`) | ❌ |
| SIGN-03 | `signature/start` without consent → 409 `consent_required` and no DocuSeal call; consents accept `esign`; `?step=<uuid>` forwarded, anything else stripped | unit | `… worker/src/routes/c-signature.test.ts`, `client-link.test.ts` | ❌ / edit |
| SIGN-03 | `CONSENT_TEXT.esign` contains the paper-copy, withdrawal, scope, contact-update, and device-requirement statements | web | `vitest run --project web src/lib/consent-text.test.ts` | edit |
| SIGN-04 | ≤ 3 taps, no horizontal scroll at 390 px, embed props (`data-allow-to-resubmit="false"`) | e2e (Chromium, stubbed `form.js`) | `pnpm -C app test:e2e` | ❌ |
| SIGN-04 | CSP on the deployed `/c/` contains the DocuSeal hosts; a live test-mode embed loads with no CSP violation | smoke (deployed) | `pnpm -C app smoke -- --esign` | edit |

### Sampling Rate
- **Per task commit:** the quick command for the touched module plus `node app/scripts/check-file-sizes.mjs`.
- **Per wave merge:** `pnpm -C app check && pnpm -C app test:live`.
- **Phase gate:** the full suite, `test:e2e`, the deployed smoke run, and the manual iPhone Safari and Android Chrome run (held out).

### Wave 0 Gaps
- [ ] `app/playwright.config.ts`, `app/e2e/sign-taps.spec.ts`, a `test:e2e` script, and the `@playwright/test@1.63.0` install
- [ ] Fixtures: `worker/test/fixtures/docuseal/{template,submission_create,submission_completed,submission_declined,submitter_pending,webhook_form_completed}.json` (shapes from the openapi.json examples); `fixtures/smarty/{autocomplete,autocomplete_units,street_y,street_d,street_empty}.json` (shapes from the reference examples); `tiny.pdf` (exists from Phase 4)
- [ ] `signDocuseal` helper next to the Phase 4 Truv signing helper
- [ ] The fake `form.js` used by the e2e spec

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (client bearer link) | Phase 2 cookie session; DocuSeal's `embed_src` is only ever returned to that session after consent |
| V3 Session Management | yes | Existing `rs_client` cookie; the sign route needs no new session |
| V4 Access Control | yes | `findSessionItem` request scoping; the RPC re-checks `link → request → item`; admin-only template mapping |
| V5 Input Validation | yes | zod or type guards on suggest `q` (≤ 32 characters), the address body (state enum, `^\d{5}$`), `step` UUID, and webhook payload after HMAC |
| V6 Cryptography | yes | Web Crypto HMAC-SHA256 `verify`; sha256 of artifacts; no hand-rolled compare |
| V8 Data Protection | yes | No street text in events or logs; URLs and `embed_src` never stored; `no-store` on `/api/c/*` |
| V14 Config | yes | Secrets via `provision-secrets.mjs` stdin; nothing in `VITE_*` |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged or replayed webhook | Spoofing/Tampering | HMAC over the raw body, ±300 s, ledger unique key, consumer re-reads state |
| Forwarded signing link signs as the client | Spoofing | Link expiry and revoke, consent gate, `expire_at` = link expiry; identity step-up in Phase 8 (2848/8821 remote-signing attestation is a staff duty) |
| Smarty credit burn through the suggest proxy | DoS / cost | Per-link 30/min window, cookie session required, 3-character minimum, debounce |
| Third-party script supply chain (`cdn.docuseal.com/js/form.js`, no SRI, 2 h cache) | Tampering | Accepted vendor risk. Load it only on `/c/sign/*`; self-hosting the bundle would redistribute AGPL code |
| Address PII in logs | Information disclosure | Event payload is `{source, verified, county_fips, rdi}` only; the allowlisted logger |

## Sources

### Primary (HIGH confidence)
- `https://console.docuseal.com/openapi.json` (fetched): servers, `X-Auth-Token`, `POST /submissions` schema and array response, `GET /submissions/{id}`, `/submitters/{id}`, `/templates` (and `/{id}`), webhook schemas, status enums
- `@docuseal/react@1.0.75` tarball (`dist/index.d.ts`, `form.d.ts`, `index.esm.js`): exports, props, defaults, script injection, events
- `https://cdn.docuseal.com/js/form.js` (fetched, 548 KB): shadow DOM, base URL from `src`, chunk path `https://docuseal.com/js/`, FontFace, Resubmit logic, sandbox banner
- docuseal.com/resources/use-webhooks (HMAC), /guides/download-signed-documents (40 minutes), /resources/use-test-mode, /signing-api (pricing), /docs/embedded/form/react
- smarty.com/docs/apis/us-autocomplete-pro-api/reference, /docs/apis/us-street-api/reference, /docs/account/authentication; github.com/smarty/smartystreets-javascript-sdk `examples/us_autocomplete_pro.mjs`
- irs.gov/tax-professionals/submit-forms-2848-and-8821-online; irs.gov/instructions/i2848 (rev. 09/2021)
- 15 U.S.C. 7001(c)(1), law.cornell.edu/uscode/text/15/7001
- In-repo: `supabase/migrations/0002_platform_foundation.sql` (style, grants at lines 124–136), `app/package.json`, `app/vitest.config.ts`, `app/wrangler.jsonc`; plans 04-01 (DDL, interfaces, rank and item mapping), 04-03 (CSP, consents route, `storeProviderFile`), 02-01 (item kinds, seeds), 02-07 (`allowInWindow`), 01-07 (client-link headers and tests)
- npm registry: versions and publish times; legitimacy seam output

### Secondary (MEDIUM confidence)
- Smarty pricing snippets (42 days, 1,000 lookups, autocomplete counted by keystroke), from search result excerpts
- playwright-core 1.64.0 `coreBundle.js` device descriptors (`iPhone 13`, `Pixel 7`)

### Tertiary (LOW confidence)
- Everything in the Assumptions Log

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. Versions come from the registry, behavior from the shipped source.
- Architecture: HIGH. It reuses the planned Phase 2–4 contracts that I read.
- Pitfalls: HIGH for CSP, Resubmit, HMAC, and URL TTL (read from source). MEDIUM for iOS zoom inside the shadow DOM (verified only on a real device).

**Research date:** 2026-10-11
**Valid until:** 2026-11-10. Re-check `form.js` hosts if DocuSeal changes its CDN, and recheck Smarty if Autocomplete Pro is retired.
