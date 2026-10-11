---
phase: 06-address-e-sign
plan: 07
subsystem: staff review / e-sign
tags: [docuseal, e-sign, review, timeline, staff-portal]
status: complete
requires: ["06-03", "06-04", "06-05", "06-06"]
provides: [listRequestSignatures, esignStage, SignatureView, SignatureCard, signatureChip, "email route step option"]
affects: [admin-review response, admin-request-actions email route, timeline labels]
tech-stack:
  added: []
  patterns: ["PostgREST JSON-path select/filter (data->>env, payload->>connection_id) to keep vendor fields out of the read model"]
key-files:
  created:
    - app/worker/src/db/signature-view.ts
    - app/worker/test/signature-view-live.test.ts
    - app/src/features/review/signature-status.ts
    - app/src/features/review/signature-card.tsx
  modified:
    - app/worker/src/routes/admin-review.ts
    - app/worker/src/routes/admin-request-actions.ts
    - app/src/features/review/api.ts
    - app/src/features/review/review-panel.tsx
    - app/src/features/requests/requests-api.ts
    - app/src/features/requests/request-link-actions.tsx
    - app/src/features/timeline/labels.ts
decisions:
  - "Signature stage: connection status wins (done/error); an open connection is refined by its last esign.viewed/esign.started event matched on payload->>connection_id"
  - "emailCopy moved from request-link-actions.tsx to requests-api.ts so the signature card reuses the exact Phase 2 copy without a react-refresh lint warning"
  - "Email route step check is a lookup against the firm-scoped request's signature items only (covers non-UUID, foreign, upload)"
metrics:
  duration: 44min
  completed: 2026-10-11
actuals:
  tokens: 21000
  tasks: 2
  commits: 2
plan_head_before: 0e78497cfac28d71dc3e8d731d305f621887307f
plan_head_after: 9c989e23ce55e3ca9516a217dc7bba88bfdac4d9
---

# Phase 6 Plan 07: Staff signature card Summary

Staff see each e-sign item's template, an honest stage chip (Waiting/Viewed/Signing/Signed/Declined/Expired/Needs attention), a `Test` badge, the IRS 2848/8821 online-submission note, and can copy, email, or refresh a signing link that is always the ResSpark client link plus `?step=<item id>`. The case timeline names every e-sign step.

## Tasks

| Task | Commit | What |
|---|---|---|
| 1 (tracer) | f991cc0 | `db/signature-view.ts` + `signatures` on the review response; `SignatureCard` with chip, Test badge, Copy signing link; live test |
| 2 | de29d91 | Refresh (Phase 4 route), Email signing link (`step` on the Phase 2 email route), `E-sign not set up`, IRS note, timeline labels |

`commits: 2` counts the two `(06-07)` commits. `git rev-list --count plan_head_before..plan_head_after` is 20 because 07-07, 07-08, 07-09 and phase 04 executors committed on the same `zack` branch over the same window.

## Notes the plan asked for

- **Phase 4 `connection.*` labels:** none existed (bank/payroll events used the word fallback). New entries were added; non-signature payloads still return the same words (`connection done`, etc.) through a shared `words()` helper.
- **Phase 2 email copy reused verbatim:** `Email sent to {contact_email}`, `Email not configured — copy the link and send it yourself`, `Email failed — copy the link and send it yourself` (now `emailCopy` in `requests-api.ts`).
- **Events match:** `connection_record_event` merges `connection_id` into every payload, so the query is `.in('action', ['esign.viewed','esign.started']).in('payload->>connection_id', <latest connection ids>)` ordered `created_at DESC, id DESC`, first row per connection. Verified live.

## Verification

- Web: signature-status (9), signature-card (14), review-panel, requests-api, request-link-actions, labels: all pass.
- Worker-node: admin-review.test.ts (23, incl. 8 `esignStage` cases), admin-request-actions.test.ts (28): pass.
- Live: signature-view-live.test.ts (5) and review-live.test.ts pass (`test:live:file`). The full `test:live` suite was not run, to avoid racing other executors' live fixtures.
- `pnpm -C app run check`: file sizes and golden fixtures pass. `tsc -b` fails only in 07-07's uncommitted `worker/src/financials/propose/{bank,payroll}.test.ts` and `worker/test/financials-bank-payroll.test.ts`. Run separately, `eslint .` has 0 errors and `pnpm test` gives 158 files, 1928 tests passed.

## Deviations from Plan

1. **[Rule 3] Email-route tests live in `worker/test/admin-request-actions.test.ts`**, not `admin-requests.test.ts`. The Phase 2 email tests are in that file, so the `step` cases went there too, and the doc is `docs/app/worker/test/admin-request-actions.test.md`.
2. **[Rule 3] Item template key is `config.template`**, not `config.template_key`. That is what `c-signature.ts` and the portal fixture use. The view still exposes it as `template_key`.
3. **[Rule 2] `emailCopy` moved to `requests-api.ts`** (touches `request-link-actions.tsx` and its doc) so the copy is shared, not duplicated.
4. Extra companion docs were added for the test files, following CLAUDE.md: `signature-status.md` has a test section, and `signature-card.md` covers its test.

## Known Stubs

None.

## Self-Check: PASSED

- Files present: signature-view.ts, signature-view-live.test.ts, signature-status.ts, signature-card.tsx and their docs.
- Commits f991cc0 and de29d91 are ancestors of HEAD.
