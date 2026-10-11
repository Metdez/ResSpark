---
phase: 06-address-e-sign
plan: 02
subsystem: e-sign (Worker)
tags: [docuseal, esign, consent, connections]
requires: [06-01, 04-03]
provides: [startSignature, cSignatureRoute, DocuSeal client, CONSENT_TEXT.esign, esign-templates, getEsignMapping]
affects: [06-04, 06-05, 06-06, 06-07]
key-files:
  created: [app/src/lib/esign-templates.ts, app/worker/src/db/esign-settings.ts, app/worker/src/integrations/esign/docuseal.ts, app/worker/src/integrations/esign/start.ts, app/worker/src/routes/c-signature.ts, app/worker/test/esign-start.test.ts, app/worker/test/fixtures/docuseal/*.json]
  modified: [app/src/lib/consent-text.ts, app/worker/src/routes/c-connections.ts, app/worker/src/db/connections.ts, app/worker/src/db/connections-ops.ts, app/worker/src/integrations/bank/provider.ts, app/worker/src/index.ts]
decisions:
  - "Case read via getRequest (Phase 2 bundle: case + contact_email); address via getCaseAddress, so only a confirmed address is prefilled"
  - "TemplateInvalidError (start.ts) maps to 503 template_invalid; thrown before any row is written"
status: complete
actuals:
  tokens: 30000
  tasks: 2
  commits: 2   # fc1d9e6, ef7afb6; rev-list from the ledger counts 11 because other executors commit on the shared tree
plan_head_before: 296a027f1c127af39984db3dcf7c40df145a826f
plan_head_after: ef7afb6
---

# Phase 6 Plan 02: E-sign start path Summary

Consent-gated `POST /api/c/items/:itemId/signature/start`: it writes the `docuseal`/`signature` connection row before calling DocuSeal `POST /submissions` (`send_email`/`send_sms` false, read-only prefill). On later opens it reuses the row through `GET /submitters/{id}`, and it starts a new submission after a decline or an expiry. Proven live with DocuSeal stubbed.

## Tasks
| # | Commit | What |
|---|--------|------|
| 1 | fc1d9e6 | esign-templates, CONSENT_TEXT.esign (esign-v1), DocuSeal client, startSignature, c-signature route mounted, consents guard widened, unions widened, staff list filtered, fixtures, live tracer, docs |
| 2 | ef7afb6 | unit tests: docuseal (9), start (9), c-signature (13), c-connections +3 esign consent cases, consent-text (4), esign-templates (3); test docs |

## Plan output records
- **Measured start latency:** 1102 ms for the first create (live Supabase, DocuSeal stubbed).
- **Case reader used:** `getRequest` from `db/requests.ts` (gives the case and `contact_email`), plus `getCaseAddress` from `db/case-address.ts`. `getCase` does not select the address columns.
- **`expire_at`:** sent as the link's `expires_at` exactly as Postgres returns it (ISO 8601 with offset). The live test compares it with `Date.parse`. Assumption A3 still needs the Plan 08 live contract run.
- **Extra union widening:** `PROVIDER_CAPABILITIES` in `integrations/bank/provider.ts` needed `docuseal: null` because it is a `Record<ProviderId, …>`. In `connections-ops.ts`, `projectSummary` casts `kind` to `'bank' | 'payroll'`, since summaries only cover bank/payroll rows. Nothing else needed widening.

## Verification
- `test:live:file worker/test/esign-start.test.ts`: 4/4 passed (409 with no vendor call, then consent, create, reuse; `listRequestConnections` returns `[]`).
- Touched unit files: all green. `check-file-sizes`: OK. Worker `tsc`: clean. ESLint on my files: clean.
- `pnpm run check` fails only in `tsc -b` on `src/features/client-portal/connect/connection-api.ts`. That file is untracked and belongs to another executor (04-06), not this plan. I did not run the full `test:live` suite; I ran only this plan's live file.

## Deviations from Plan
1. **[Rule 3 - Blocking]** Widening `ProviderId` broke the `PROVIDER_CAPABILITIES` record and `projectSummary`'s kind type. Fixed with `docuseal: null` (one line in 04-04's file, which was already committed, so there was no foreign hunk) and a typed cast. Both are in fc1d9e6.
2. The consents guard uses `isConsentKind` (any key of `CONSENT_TEXT`), as the plan specifies.
3. `consent-text.test.ts` did not exist before, so it was created rather than extended.

## Requirements
SIGN-01 and SIGN-03 are not marked complete: plans 06-05, 06-06, 06-07 and 06-08, which are still unfinished, also declare them.

## Known Stubs
None. With no DocuSeal key the route answers 503 `provider_not_configured`, as designed. DocuSeal secrets are not in `secrets.required`.

## Self-Check: PASSED
- All files under key-files exist; commits fc1d9e6 and ef7afb6 are ancestors of HEAD.
