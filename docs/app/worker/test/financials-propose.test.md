# `app/worker/test/financials-propose.test.ts`

A live test of the `financials_propose` job against the Supabase project (FORM-03, ADDR-02). It is skipped when `SUPABASE_URL` or `SUPABASE_SECRET_KEY` is missing. Run it with `pnpm -C app run test:live:file worker/test/financials-propose.test.ts`.

## Setup

- `seedConfirmed(fips, countyName, state?, opts?)` seeds a fresh case under the test firm with `seedFinancialCase`. It then writes a confirmed Smarty address straight onto `cases`: `address_source 'smarty'`, `address_verified true`, `address_confirmed_at` now, and the given FIPS and Smarty county name.
- `env` sets `LOGICS_MODE: 'fake'` and has no Smarty keys, so the address fallback is skipped. The unit tests in `address.test.ts` cover the fallback. `NOW` is fixed at 2026-10-11 so the age is deterministic.
- `open(caseId, source)` reads the case's `proposed` rows for one source.
- `afterAll` runs each fixture's `cleanup()`. That deletes the proposals and the other rows the fixture made. Cases are never deleted.

## Tests

| Test | Checks |
|------|--------|
| Confirmed FIPS 06037 | The first run inserts 2 rows: `state_of_residence = 'CA'` and `county_of_residence = 'Los Angeles County'`, both reliability A with method `confirmed_address_fips`. Each ref is the address ref with the FIPS label, and no ref holds the street text. A second run keeps 2 rows and inserts 0. |
| Logics case 900001 | `LOGICS_MODE` is `fake`. The suite reuses the test firm's existing 900001 case, because `(firm_id, logics_case_id)` is unique and other live suites keep one. It only deletes that case's proposals, before and after. If no such case exists, a fresh one is seeded. The run gives `address: 'skipped'` (no Smarty keys) and inserts 3 `logics` rows: married `true` (A), age 46 (A) and liability 18450 (B). Neither the case's events nor the rows contain `07/24/1980` or `18,450`. |
| Old Connecticut FIPS 09003 | Only `state_of_residence` is proposed, and `countyBlock` with the live `county_fips_map` row gives `ct_old_county`. |
| FIPS 99999 | `county_of_residence` = Smarty's name `Nowhere`, reliability C, method `smarty_county_name_not_in_irs_table`. |
| Through the queue | `queue()` with one `financials_propose` message acks it once and never retries it, and the two proposals exist. |
