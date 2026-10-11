---
phase: 06-address-e-sign
verified: 2026-10-11T19:34:16Z
status: human_needed
score: 7/8 must-haves verified
covered_files: [".planning/phases/06-address-e-sign/06-01-PLAN.md",".planning/phases/06-address-e-sign/06-01-SUMMARY.md",".planning/phases/06-address-e-sign/06-02-PLAN.md",".planning/phases/06-address-e-sign/06-02-SUMMARY.md",".planning/phases/06-address-e-sign/06-03-PLAN.md",".planning/phases/06-address-e-sign/06-03-SUMMARY.md",".planning/phases/06-address-e-sign/06-04-PLAN.md",".planning/phases/06-address-e-sign/06-04-SUMMARY.md",".planning/phases/06-address-e-sign/06-05-PLAN.md",".planning/phases/06-address-e-sign/06-05-SUMMARY.md",".planning/phases/06-address-e-sign/06-06-PLAN.md",".planning/phases/06-address-e-sign/06-06-SUMMARY.md",".planning/phases/06-address-e-sign/06-07-PLAN.md",".planning/phases/06-address-e-sign/06-07-SUMMARY.md",".planning/phases/06-address-e-sign/06-08-PLAN.md",".planning/phases/06-address-e-sign/06-08-SUMMARY.md","app/e2e/sign-taps.spec.ts","app/scripts/smoke.mjs","app/src/features/client-portal/address/address-api.ts","app/src/features/client-portal/address/address-sheet.tsx","app/src/features/client-portal/address/manual-address-form.tsx","app/src/features/client-portal/sign/docuseal-embed.tsx","app/src/features/client-portal/sign/sign-page.tsx","app/src/features/review/address-card.tsx","app/src/features/review/signature-card.tsx","app/src/features/review/signature-status.ts","app/src/features/settings/integrations/esign-api.ts","app/src/features/settings/integrations/esign-templates-card.tsx","app/src/lib/consent-text.ts","app/src/lib/esign-templates.ts","app/src/lib/us-states.ts","app/src/routes/c/sign.$itemId.tsx","app/worker/src/db/case-address.ts","app/worker/src/db/esign-settings.ts","app/worker/src/db/signature-view.ts","app/worker/src/integrations/esign/docuseal.ts","app/worker/src/integrations/esign/ingest.ts","app/worker/src/integrations/esign/start.ts","app/worker/src/integrations/smarty/client.ts","app/worker/src/jobs/signature-reconcile.ts","app/worker/src/middleware/client-csp.ts","app/worker/src/routes/admin-esign.ts","app/worker/src/routes/admin-requests.ts","app/worker/src/routes/c-address.ts","app/worker/src/routes/c-signature.ts","app/worker/src/routes/client-link.ts","app/worker/src/webhooks/docuseal.ts","supabase/migrations/0007_address_esign.sql"]
covered_digest: "v3:sha256:ad5d7775d0afde53462c13640fad4780e23157c3035e31726611706d66cba384"
behavior_unverified: 1
overrides_applied: 0
behavior_unverified_items:
  - truth: "On completion the signed PDF and the audit-trail PDF are stored in the case immediately with a content hash, the item shows as signed, and the signed PDF can be pushed to Logics like any other document (SIGN-02)"
    test: "pnpm -C app run test:live:file worker/test/esign-complete.test.ts worker/test/esign-reconcile-live.test.ts"
    expected: "Signed form.completed -> 200 + ledger -> consumer GET /submissions -> 2 documents (signed_document, esign_audit_log) with sha256, status ready -> connection done, item submitted, request waiting_on_staff; after approval the signed PDF push row reaches sent in fake mode"
    why_human: "The only tests that exercise the completion transition write fixtures to the live Supabase project; the verifier was barred from live writes. Unit tests cover ingest pieces only; the live DB holds no residual e-sign rows to inspect."
human_verification:
  - test: "Run the two live e-sign completion tests (command above) against the test firm"
    expected: "Both files green: sha256 on both PDFs, connection done, item submitted, signed PDF push row sent"
    why_human: "Writes to the live database; verifier was read-only"
  - test: "DocuSeal Test Mode end to end (USER ACTION: API key, webhook secret, template mapped in Settings -> Integrations, then pnpm -C app smoke:esign and the opt-in docuseal-contract test)"
    expected: "Real form.js loads under the deployed /c/* CSP with no securitypolicyviolation, signing completes, staff card shows Signed with Test badge, signed + audit PDFs appear under the item, expire_at ISO accepted (A3)"
    why_human: "No DocuSeal keys exist; every DocuSeal path is proven only against stubs and a fake form.js"
  - test: "Real iPhone Safari and real Android Chrome, per docs/app/runbooks/esign-phone-check.md"
    expected: "Fresh link <= 3 taps and copied signing link <= 2 taps to the first signature field; focusing the typed-signature input does not zoom; nothing scrolls sideways; staff mirror shows 'Client is on: signature'"
    why_human: "06-08 backstop truth; Playwright uses a 390x844 Chromium viewport and a stubbed DocuSeal form"
  - test: "Smarty live (USER ACTION: SMARTY_AUTH_ID/TOKEN), type the start of a real address on a phone"
    expected: "Suggestions after 3 chars, pick -> 'Is this your home address?' -> saved; staff address card shows USPS verified, county name + FIPS, Residential/Commercial; client never sees county"
    why_human: "No Smarty keys; deployed suggest answers 503 and the client falls back to the manual form"
  - test: "Decide the legacy src/frontend intake (served by vercel.json on main) which still has a county dropdown (county_of_residence)"
    expected: "Either retire/redirect that deployment or accept it as out of ResSpark's client UI"
    why_human: "Already a deferred user decision in 07-08; ROADMAP SC1 says 'no county dropdown anywhere'"
  - test: "Counsel review of ESIGN consent text esign-v1 and of which forms may be e-signed (roadmap scope note)"
    expected: "Wording approved or a new version string issued"
    why_human: "Legal judgment"
---

# Phase 6: Address & E-Sign Verification Report

**Phase Goal:** As a tax-resolution client, I want to confirm my address and sign my forms on my phone from the same link, so that I am done without zooming, scrolling, or waiting on an email.
**Verified:** 2026-10-11T19:34:16Z
**Status:** human_needed
**Re-verification:** No (initial verification)

Committed code only (HEAD 6d22b41; 5 uncommitted files from another executor touch c-connections/payroll, none in the Phase 6 paths judged here).

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1 / ADDR-01: client picks a USPS-validated suggestion; staff see address, county, RDI; no county dropdown anywhere | VERIFIED (warning) | `c-address.ts` suggest + confirm (Smarty server-side, manual fallback on 503/422/error); `case_confirm_address` writes 13 columns (live DB: 13 columns, SECURITY INVOKER, `search_path=""`, anon EXECUTE false). Confirm response omits county/FIPS/RDI. `AddressCard` shows county as text + FIPS + RDI. No county text/input in `app/src/features/client-portal/**`; `shared/questions.test.ts` asserts the client is never asked state/county. Warning: legacy `src/frontend` (still built by `vercel.json`) has a county select. |
| 2 | SC2 / SIGN-01: staff attach engagement letter / 2848 / 8821; client signs embedded on a phone | VERIFIED (stubbed provider) | Admin mapping card (`admin-esign.ts`, admin-only, one-signer check) mounted at settings/integrations; builder "Add a form to sign" lists mapped keys only; `/c/sign/$itemId` renders lazy `DocusealForm` with D-13 props. Real DocuSeal never exercised (no keys) -> human item. |
| 3 | SC3 / SIGN-04: <= 3 taps fresh, <= 2 copied, no pinch-zoom or sideways scroll; agent sees the step | VERIFIED | `pnpm -C app run test:e2e`: 7/7 passed at 390x844 touch (fresh 3 taps, copied 2 taps, scrollWidth check after each tap, all inputs >= 16 px incl. shadow DOM). `SignPage` heartbeat `lastStep: 'signature'` -> mirror card "Client is on: signature". Real devices -> human (backstop). |
| 4 | SC4 / SIGN-03: copyable signing link; ESIGN consent captured before signing | VERIFIED | `SignatureCard` copies `link.url + ?step=<itemId>`; `client-link.ts` keeps only a strict UUID step; email route checks step is a signature item of the request. `c-signature.ts` checks `hasConsent(linkId,'esign','esign-v1')` before `startSignature` (the only `createSubmission` caller); test "no esign consent is 409 consent_required and never starts" passed. |
| 5 | SC5 / SIGN-02: signed PDF + audit PDF stored with sha256, item signed, pushable | PRESENT_BEHAVIOR_UNVERIFIED | Wired: HMAC adapter -> `reconcileSignature` (GET submission, never payload) -> `ingestSignedArtifacts` -> `storeProviderFile` (sha256 via node:crypto, %PDF sniff) -> `connection_set_status('done')`. Push RPC accepts any `ready` doc with sha256 on an approved item. Live tests `esign-complete.test.ts` / `esign-reconcile-live.test.ts` assert all of it but write to the live DB, so not run here. |
| 6 | Form 433-A can never be offered for signing | VERIFIED | Whitelist `ESIGN_TEMPLATE_KEYS` enforced at: builder UI (test "never offers 433" passed), `POST /api/admin/requests` (400 bad_template before any DB write), `PUT /api/admin/esign/templates` (test passed), `signature/start` (test "form_433a is 409 bad_template" passed). Live DB: 0 signature items with a non-whitelisted template. |
| 7 | DocuSeal signing URL never stored or shown to staff | VERIFIED (advisory) | `embed_src` only returned to the consented client session; never written. Staff projections (`signature-view.ts`, `projectSummary`) select explicit columns without `link_ref`/`external_id`; `has_column_privilege('authenticated','connections','link_ref','select')` = false. Client renders only `https://docuseal.com/s/` prefixes. Advisory: the submitter slug is stored in `connections.link_ref` per locked D-12 and is never read for docuseal rows. |
| 8 | No county field or picker anywhere in the client UI | VERIFIED | grep of `app/src/features/client-portal`, `app/src/routes/c`: only comments forbidding county. Intake step uses `QUESTION_UI` which excludes `county_of_residence`. 433-A view shows county as text ("shown, never chosen"). |

**Score:** 7/8 truths verified (1 present, behavior-unverified)

### Required Artifacts

All 38 plan artifacts exist and pass `verify.artifacts` (8/8 plans exit 0). Every Phase 6 code file has a companion doc under `docs/` and the 500-line gate passes (`check-file-sizes.mjs` exit 0; largest is `smoke.mjs` at 491).

### Key Link Verification

31/32 links pass `verify.key-links`. The one miss (06-05 card -> `/api/admin/esign/templates`) is a grep false negative: `esign-api.ts` builds `${PATH}/templates` with `PATH = '/api/admin/esign'`, the card calls `saveEsignMapping`, and `adminEsignRoute` is mounted at `/api/admin` in `worker/src/index.ts`. WIRED.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Phase 6 unit suites | `pnpm -C app exec vitest run` (31 files) | 31 files, 330 tests passed | PASS |
| 3-tap / 2-tap budget | `pnpm -C app run test:e2e` | 7 passed | PASS |
| Deployed Worker | `node app/scripts/smoke.mjs https://resspark.zh-a16.workers.dev` | 14 ok incl. `ok webhooks docuseal 401` | PASS |
| Deployed CSP on `/c/sign/<id>` | curl headers | script-src has cdn.docuseal.com + docuseal.com; connect-src and font-src docuseal.com; no new frame-src | PASS |
| Migrations | `db-migrate.mjs --status` | 0007_address_esign applied | PASS |
| Live schema | read-only query | 13 address columns; three CHECKs widened, one each | PASS |
| `--esign-flow` smoke, live tests | not run | write to the live DB | SKIP (human) |

### Requirements Coverage

| Requirement | Status | Evidence |
|---|---|---|
| ADDR-01 | SATISFIED (Smarty live = USER ACTION) | Truths 1, 8 |
| SIGN-01 | SATISFIED (DocuSeal live = USER ACTION) | Truths 2, 6 |
| SIGN-02 | NEEDS HUMAN (run live tests) | Truth 5 |
| SIGN-03 | SATISFIED | Truth 4 |
| SIGN-04 | SATISFIED (real devices = backstop) | Truth 3 |

No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| (phase files) | - | TBD/FIXME/XXX | none found | - |
| `vercel.json` -> `src/frontend/src/questions.ts` | 40 | county dropdown on a still-deployed legacy intake | Warning | Conflicts with SC1 "anywhere" wording outside the ResSpark app; already a 07-08 user decision |
| `app/worker/src/integrations/esign/start.ts` | 118 | stores the DocuSeal slug (bearer equivalent of `/s/{slug}`) in `link_ref`, never read | Info | Locked by D-12, service-role only; smallest hardening is to drop `link_ref: s.slug` and the matching assertion in `start.test.ts:50` / `esign-start.test.ts:122` |
| `app/src/features/review/address-card.tsx` | 29 | `{county_name} County` | Info | Reads oddly for parishes/boroughs/independent cities (e.g. "Richmond City County") |

### Human Verification Required

1. **Live e-sign completion tests**: run `pnpm -C app run test:live:file worker/test/esign-complete.test.ts worker/test/esign-reconcile-live.test.ts`. Expected: green. This gives SC5 its behavioral evidence.
2. **DocuSeal Test Mode end to end**: USER ACTION keys and template, then `pnpm -C app smoke:esign` plus the opt-in contract test. Expected: the real form loads under the deployed CSP, signing completes, Signed shows with the Test badge, and both PDFs arrive.
3. **Real phones** (iPhone Safari, Android Chrome) per `docs/app/runbooks/esign-phone-check.md`. Expected: 3 and 2 taps, no zoom, no sideways scroll.
4. **Smarty live**: expected suggestions, then verified address with county, FIPS and RDI for staff only.
5. **Legacy county dropdown decision**: the `src/frontend` app served by `vercel.json` still has one.
6. **Counsel review** of the `esign-v1` consent text and of which forms may be e-signed.

### Gaps Summary

No blocking gaps. The phase is fully wired in the ResSpark app. Several protections hold at more than one layer:
- Form 433-A is refused at four places.
- Consent gates the only submission path.
- Staff never see the signing URL.
- The client portal has no county field.
- The tap budget passes in Playwright.

What remains is behavioral proof that needs either live writes or real keys and devices: the completion-to-storage-to-push transition, real DocuSeal and Smarty, and real phones.

---

_Verified: 2026-10-11T19:34:16Z_
_Verifier: Claude (gsd-verifier)_

## Orchestrator evidence (2026-10-11)

SIGN-02 behavior proven live: `pnpm -C app run test:live:file worker/test/esign-complete.test.ts worker/test/esign-reconcile-live.test.ts` → 2 files, 11/11 passed (test firm only, cleaned up). Deployed commit `ec8efea` (version `300b5f25`) passes `smoke` (14 ok), `smoke:connect` and `smoke:esign` (keys: smarty no, docuseal no).

## Hardening follow-up (2026-10-11)

Both Info items in the anti-pattern table are fixed:
- `fa4739e`: `startSignature` no longer writes `link_ref: s.slug`. A grep found no reader of `link_ref` for DocuSeal rows (the only `findConnectionByLinkRef` caller is the Plaid webhook path), and `connections.link_ref` is nullable TEXT, so the schema did not change. `start.test.ts` asserts the update carries no `link_ref` or slug, and the live `esign-start.test.ts` asserts `link_ref: null`. `pnpm -C app run test:live:file worker/test/esign-start.test.ts` gave 4/4 passed.
- `64ccf02`: `AddressCard` adds ` County` only when the name does not already end in County, Parish, Borough, City, Census Area, Municipality, or Municipio. Tests cover Los Angeles, Richmond City, Orleans Parish, Anchorage Municipality, and Juneau City and Borough.

`pnpm -C app run check` passed: 162 test files passed and 36 live files skipped (1962 tests passed). Nothing was deployed. `covered_digest` above predates these edits to `start.ts` and `address-card.tsx`.
