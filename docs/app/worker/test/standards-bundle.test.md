# `app/worker/test/standards-bundle.test.ts`

Live, read-only proof of `standards_bundle` (D-11) and the Connecticut names-only correction
(open question 1) through `fetchStandardsBundle`. Skips with a printed reason when `SUPABASE_URL` or
`SUPABASE_SECRET_KEY` is missing.

Run: `pnpm -C app run test:live:file worker/test/standards-bundle.test.ts` (also part of `test:live`).

| Test | Expected (IRS standards effective 2026-06-29, as seeded) |
|------|-----------------------------------------------------------|
| Los Angeles County, 1 person, 0 vehicles | housing 3001, area `''`, operating 0, ownership 0, health 90 / 163, national 867 |
| Miami-Dade County, 1 vehicle | area `Miami`, operating 423, ownership 703 |
| household of 6; unknown county | national 2970 (2176 + 2 × 397); housing `null` |
| Connecticut planning regions | Lower Connecticut River Valley 2388, Northeastern 2026, South Central 2359, Southeastern 2157; no Connecticut row named `Region` or `Planning Region` |

The expected amounts are the seeded values, not new figures: the test fails if a standards row is
changed or a name no longer resolves.

## Result (2026-10-11, live project `zvkphuikjpwoauqdimcf`)

4 passed. The very first run right after applying 0008 failed once on the first call with
`financials_rpc_failed` and passed on every rerun (likely the PostgREST schema cache reload).
