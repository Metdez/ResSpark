# `app/worker/test/fixtures/financials.ts`

Seed helper for the Phase 7 live tests (Plans 02-12).

| Part | What it does |
|------|--------------|
| `TEST_FIRM` | The automated test firm `00000000-0000-0000-0000-00000000000e`; live tests write only under it. |
| `must` | Throws with a label when a Supabase call fails or returns no data. |
| `FinancialFixture` | What a seed returns: firm id, case id, request id (or null), item ids keyed by label, and `cleanup()`. |
| `seedFinancialCase(env, opts)` | Upserts the test firm, inserts a fresh case (`crypto.randomUUID()`), optionally a `case_financial_data` row (`opts.row`), and optionally an `opened` request with items (`opts.withRequest`). `opts.logicsCaseId` sets `cases.logics_case_id`. A fresh case per call keeps suites isolated, since `case_financial_data` has one row per case. |
| `cleanup()` | Deletes the case's proposals, financial row, determination runs, documents, request items and (best effort) the request. The case itself stays: `events.case_id` has no `ON DELETE`, and the orchestrator rule is never to delete cases. |
