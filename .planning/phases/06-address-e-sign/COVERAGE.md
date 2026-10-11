# Phase 6 — API Coverage Decision Matrix

> Full coverage by default. Opt-outs are explicit, reasoned decisions. Produced by gsd-planner because the Phase 6 plans integrate the DocuSeal Cloud REST API, the DocuSeal embedded form, and two Smarty APIs. Shapes come from DocuSeal's live OpenAPI file, the `@docuseal/react@1.0.75` tarball, and the Smarty reference pages (06-RESEARCH.md § Q1–Q3).

## DocuSeal Cloud (`https://api.docuseal.com`, header `X-Auth-Token`, Test Mode for the demo)

| capability | decision | reason |
|---|---|---|
| `GET /templates` (list, `limit` ≤ 100) | INTEGRATE | Plan 05 admin mapping card lists the firm's templates (D-11) |
| `GET /templates/{id}` | INTEGRATE | Plan 02 reads the single signer role and field names for prefill; Plan 05 enforces the one-signer template contract (D-11, D-12) |
| `POST /templates/pdf`, `/templates/docx`, `/templates/html`, clone, update, archive | OPT-OUT | templates are built once in the DocuSeal console; no code-created templates (D-11) |
| `POST /submissions` (`send_email: false`, `send_sms: false`, `expire_at`, one submitter, `fields[].readonly` prefill) | INTEGRATE | Plan 02 lazy submission; the array-of-submitters response is read for `submission_id`, `slug`, `id`, `embed_src` (D-12, RESEARCH contradictions 1–2) |
| `GET /submissions/{id}` | INTEGRATE | Plan 04 `reconcileSignature` re-reads state and the short-lived document and audit URLs on every attempt (D-19) |
| `GET /submissions` (list) | OPT-OUT | submissions are tracked by id in `connections`; no listing need |
| `DELETE /submissions/{id}` (archive) | OPT-OUT | declined/expired submissions end in `error` and a new one is created; Test Mode submissions are free and need no cleanup |
| `POST /submissions/emails`, `POST /submissions/pdf`, `POST /submissions/html` | OPT-OUT | ResSpark delivers the link itself; one-off documents are not a v1 flow (D-17, D-21) |
| `GET /submissions/{id}/documents`, `combined_document_url` | OPT-OUT | `documents[]` and `audit_log_url` on the submission already give each signed PDF and the audit trail separately (D-19) |
| `GET /submitters/{id}` | INTEGRATE | Plan 02 reuse path: fresh `embed_src` and submitter status (completed → reconcile; declined → new submission) (D-12) |
| `GET /submitters` (list), `PUT /submitters/{id}` | OPT-OUT | no re-send or edit flow; the client re-opens through the ResSpark link |
| Webhooks `form.viewed`, `form.started` | INTEGRATE | Plan 04 logs `esign.viewed` / `esign.started` only; no status change (D-18) |
| Webhooks `form.completed`, `form.declined` | INTEGRATE | Plan 04 enqueues a reconcile that re-reads `GET /submissions/{id}` (D-18, D-19) |
| Webhooks `submission.*`, `template.*` | OPT-OUT | single-signer `form.*` events plus the cron cover every state change; template events have no consumer |
| Webhook HMAC (`X-Docuseal-Signature: <ts>.<hex>`, 300 s window) | INTEGRATE | Plan 04 verifies with `crypto.subtle.verify` on the raw body (D-18) |
| Test Mode (separate key, sandbox banner) | INTEGRATE | demo default `DOCUSEAL_ENV=test`, `Test` badge on staff cards (D-10, D-21) |
| Embedded form `@docuseal/react` `DocusealForm` (`<docuseal-form>`, `cdn.docuseal.com/js/form.js`) | INTEGRATE | Plan 06 full-bleed signing route; props per D-13 plus `allowToResubmit={false}` and 16 px `customCss` |
| Embedded builder `DocusealBuilder` | OPT-OUT | explicitly deferred (CONTEXT Deferred Ideas) |
| DocuSeal-sent SMS or email, `require_phone_2fa`, `require_email_2fa` | OPT-OUT | deferred to Phase 8 identity step-up; ResSpark sends no vendor messages (D-21) |
| Multi-role submissions (spouse co-signer, representative Part II) | OPT-OUT | deferred (CONTEXT Deferred Ideas); the 2848 note tells staff the representative signs Part II outside the portal |
| EU host `api.docuseal.eu` | OPT-OUT | US cloud only for ValorTax (D-08) |
| Self-hosted DocuSeal (AGPL) | OPT-OUT | deferred; hosted service only, no code copied (D-08) |

## Smarty

| capability | decision | reason |
|---|---|---|
| US Autocomplete Pro `GET /lookup` (`search` ≤ 32, `max_results=5`, `prefer_geolocation=none`) | INTEGRATE | Plan 01 server-side proxy with the secret key pair (D-03, D-04) |
| Autocomplete Pro `selected` (expand secondaries) | INTEGRATE | Plans 01/03 unit lists for `entries > 1` (D-05) |
| Autocomplete Pro `source=all`, include/exclude city/state/ZIP filters | OPT-OUT | postal addresses only; no filtering need for a home address |
| US Street `GET /street-address` (components, `candidates=1`, `match=invalid`) | INTEGRATE | Plan 01 standardization, county, FIPS, RDI, DPV (D-04) |
| US Street freeform input | OPT-OUT | `match=invalid` silently becomes strict with freeform input (RESEARCH § Q1) |
| US Street batch `POST`, `match=enhanced` | OPT-OUT | one address per client; enhanced matching is a separate license |
| US ZIP Code, US Reverse Geo, US Extract, International APIs | OPT-OUT | not needed for a US home address |
| Timezone and other `metadata` fields | OPT-OUT | timezone for quiet hours is deferred to Phase 8 (CONTEXT Deferred Ideas) |
| Embedded (browser) keys with `Referer` checks | OPT-OUT | secret keys stay in the Worker; the portal sends `no-referrer` (D-03) |
| 401 / 402 / 429 / 5xx / network handling | INTEGRATE | `ProviderError` → 502 `provider_error` → the client switches to the manual form on the first failure (D-06) |

## Anvil Etch (evaluation only)

| capability | decision | reason |
|---|---|---|
| `generateEtchSignUrl`, `AnvilEmbedFrame` | OPT-OUT | evaluated against the same 3-tap test in Plan 08 and recorded in the SUMMARY; no adapter is built unless the comparison clearly wins (D-09) |

## Not an integration surface (recorded for completeness)

| capability | decision | reason |
|---|---|---|
| Cloudflare Queues `resspark-jobs` + DLQ | INTEGRATE (platform) | Phase 4 consumer reused for `docuseal` webhook jobs and signature reconciles |
| Supabase Storage `case-documents` | INTEGRATE (platform) | signed PDFs and audit logs under `…/item/{item}/signature/{submission_id}/` via Phase 4 `storeProviderFile` |
| `@playwright/test@1.63.0` | INTEGRATE (dev tool) | 390×844 Chromium tap-count proof (Plan 06) |
