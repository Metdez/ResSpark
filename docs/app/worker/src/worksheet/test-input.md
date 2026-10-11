# `app/worker/src/worksheet/test-input.ts`

Shared unit-test input for `layout.test.ts` and `render.test.ts` (Plan 07-06). Only tests import it.

| Part | What it does |
|------|--------------|
| `golden` / `COMPLETE` | Reads `app/worker/test/fixtures/engine/golden.json` with `readFileSync`, so `tsc` never types the large JSON, and picks the case `test_complete_database_row_reaches_v2_determination`. Its row is the snapshot (Miami-Dade, household 2, one vehicle). Its expected `allowable_breakdown` is the run's breakdown. |
| `sampleRun(over)` | A `RunView` for the simple payment plan: $28,000 owed over 90 months, payment $311.12, Box D/E/F 6800/5528/1272, seven NRE lines with the engine's labels, and a Miami-Dade-shaped standards bundle. These are test values; no engine runs here. `over` replaces any field (for example `review_flags` to force several pages). |
| `sampleInput(over)` | A `WorksheetInput` built around `sampleRun()` and the golden row, with three recorded sources: cash from Plaid by `Test agent`, household size edited by staff, housing from Plaid. `over` replaces any field (the client name, the snapshot). |
