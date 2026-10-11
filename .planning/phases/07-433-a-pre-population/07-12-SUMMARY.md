---
phase: 07-433-a-pre-population
plan: 12
subsystem: worker/financials + SPA financials
status: complete
tags: [extract, document-proposals, regex, no-llm, form-03]
requires: ["07-11 ported extractors (parsePdf, mergeDocuments)", "07-02 financial_proposals_upsert", "07-09 FinancialsHeader actions slot", "07-10 document evidence"]
provides: ["POST /api/admin/cases/:id/financials/extract", "extractCaseDocuments, mergedRowToProposals, failReason", "ExtractButton, extractValues, isExtractResult"]
affects: ["433-A view header", "document-source proposals"]
tech-stack:
  added: []
  patterns: ["fixed reason codes instead of error text (D-20)", "empty upsert supersedes stale source proposals (D-07)"]
key-files:
  created:
    - app/worker/src/financials/extract-proposals.ts
    - app/worker/src/financials/extract-proposals.test.ts
    - app/worker/src/routes/admin-extract.ts
    - app/worker/test/financials-extract.test.ts
    - app/src/features/financials/extract-button.tsx
    - app/src/features/financials/extract-button.test.tsx
    - docs (6 new companion files)
  modified:
    - app/worker/src/index.ts
    - app/src/features/financials/api.ts
    - app/src/features/financials/financials-page.tsx
    - docs/app/worker/src/index.md, docs/app/src/features/financials/{api,financials-page}.md
decisions:
  - "Every document proposal cites all parsed files: the merged row mixes files, so per-column attribution is not available"
  - "Values of the wrong type for their LINES kind are dropped, so one odd value cannot fail the whole RPC batch"
  - "staffAuth is scoped to the one extract path, so it never runs again for sibling admin routes"
metrics:
  duration: "~25 min"
  completed: 2026-10-11
actuals:
  tokens: 9000
  tasks: 2
  commits: 4
plan_head_before: 4496af5a26a936659f4af26558080a952f442eeb
plan_head_after: 6d22b413f03458bf46759a218993cb27efa14b2c
---

# Phase 7 Plan 12: Extract values from uploaded PDFs Summary

Staff click `Extract values` and the case's uploaded PDFs go through the ported regex extractors. The result becomes `document`-source proposals (reliability B, one `document` ref per parsed file) that staff confirm like any other source. No LLM is called, there is no county or state from documents, and nothing writes `case_financial_data`.

## What was built

- **Task 1 (tracer), `b01d28e`.** `extract-proposals.ts` loads the case firm-scoped and reads up to 25 `ready` documents, newest first, skipping `worksheet_433a` (NULL types are kept). It skips non-PDFs and files over 10 MiB, checking both `size_bytes` and the downloaded blob. It then runs `parsePdf` one file at a time, merges with `mergeDocuments`, and calls `upsertProposals({ source: 'document', generatorVersion: 'extract-1', scopeColumns: null })`. An empty list still upserts, so stale document proposals are superseded. The `financials.extracted` event carries counts only. The route `POST /api/admin/cases/:id/financials/extract` is mounted in `index.ts`. The live test passed on the first run. The tracer gate re-ran `<verify>` green in auto mode.
- **Task 2, `6d22b41`.** `extractValues` and the `isExtractResult` guard are in `api.ts`. `ExtractButton` is an outline button that reads `Reading documents…` and is disabled while running. It toasts `Read X of Y documents. N new values proposed.`, lists unread files in plain words, and invalidates `['financials', caseId]`. It sits in `FinancialsHeader`'s `actions` slot. There are also worker unit tests for rounding, filtering and the reason mapping.

## Columns proposed per example file (golden-extract.json, minus `state_of_residence`)

| File kind | Proposed columns |
|-----------|------------------|
| Account transcript (01/02/03) | `filing_status_married`, `total_tax_owed`, `tax_only_balance`, `csed_months_remaining` (verified live for Marcus: 60000 / 44500 / 79 / false) |
| Wage transcript | `gross_wages_taxpayer` (after merge; skipped when a pay stub covers the same employer) |
| Bank statement x3 | `cash_and_bank_balances` (latest ending balance, via `combineBanks`). `has_unexplained_deposits` and `unexplained_deposits_monthly` are not `LINES` columns, so they are dropped, as are the private `_account`, `_deposits` and `_period_end` |
| Pay stub | `gross_wages_taxpayer`, `actual_current_taxes`, `pay_frequency`, `is_wage_earner` when the stub sets it |
| Lease | `actual_housing_utilities`, `rents_home`, `owns_home` |
| Mortgage (03) | `actual_housing_utilities`, `real_property_loan_balance`, `real_property_market_value`, `owns_home`, `rents_home`, `has_real_property` |
| Auto loan | `actual_vehicle_loan_lease`, `vehicle_loan_balances`, `vehicle_loan_balance_total`, `vehicle_count`, plus `vehicle_market_values` and `vehicle_market_value_total` when present (02) |
| Health insurance | `actual_health_insurance_premiums` |

Only the transcript was run live. The other rows come from the golden fixture's `packets` (the merged rows) filtered by `LINES`.

## Reason mapping

| Source | Code | SPA copy |
|--------|------|----------|
| `ExtractError` starting `No template matched` | `no_template` | No matching template |
| `ExtractError` starting `Missing`, `No amount` or `No dollar amount` | `missing_fields` | Required values not found |
| Any other error, or a storage download error | `unreadable` | Could not read this PDF |
| Over 10 MiB (row or blob) | `too_large` | Too large |
| `mime_type` not `application/pdf` | `not_pdf` | Not a PDF |

## Timing

The live round trip in Node was **951 ms**: two documents (one transcript, one PNG skipped), including the Storage download, both RPCs and the event. Worker CPU time was not measurable in this run, because nothing was deployed.

## Verification

- `pnpm -C app test:live:file worker/test/financials-extract.test.ts`: 2/2 passed. The first run inserted 4; the second kept 4. Rejecting the transcript superseded 4, a blank PDF reported `no_template`, and foreign or malformed ids returned 404.
- `vitest --project worker-node worker/src/financials/extract-proposals.test.ts`: 4/4 passed. `vitest --project web src/features/financials`: 37/37 passed.
- `pnpm -C app run check` exits 0 (162 files, 1957 tests passed).

## Deviations from Plan

1. **[Rule 2] Downloaded-size check.** `size_bytes` can be NULL on older rows, so the blob size is checked after download as well, and anything over the cap is reported as `too_large`.
2. **[Rule 2] Type filter in `mergedRowToProposals`.** A value whose type does not match its line kind (NaN, a fractional count, a non-boolean flag) is dropped. Without this, `financial_value_check` rejects the whole upsert batch.
3. **Event payload** includes `skipped` alongside `documents`, `parsed` and `failed`. It is still counts only.
4. **Extra companion docs** for the two new test files (`extract-proposals.test.md`, `extract-button.test.md`), per CLAUDE.md.
5. **Commit count.** `commits: 4` is the measured `rev-list` count. Two of those (`bc37cb5`, `0ccd29d`) are the parallel executors' docs commits interleaved on `zack`; this plan's commits are `b01d28e` and `6d22b41`.

## Known Stubs

None.

## Threat Flags

None. The new route is the planned one (T-07-48..50 mitigated: 25-document and 10 MiB caps, sequential processing, firm-scoped case read, fixed reason codes, counts-only event, no LLM path).

## Self-Check: PASSED

- All created files exist. `b01d28e` and `6d22b41` are ancestors of HEAD.
