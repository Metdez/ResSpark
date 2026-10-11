# `app/worker/test/financials-propose.test.ts`

A live test of the `financials_propose` job against the Supabase project (FORM-03, ADDR-02). It is skipped when `SUPABASE_URL` or `SUPABASE_SECRET_KEY` is missing. Run it with `pnpm -C app run test:live:file worker/test/financials-propose.test.ts`.

## Setup

- `seedConfirmed(fips, countyName, state?, opts?)` seeds a fresh case under the test firm with `seedFinancialCase`. It then writes a confirmed Smarty address straight onto `cases`: `address_source 'smarty'`, `address_verified true`, `address_confirmed_at` now, and the given FIPS and Smarty county name.
- `open(caseId, source)` reads the case's `proposed` rows for one source.
- `afterAll` runs each fixture's `cleanup()`. That deletes the proposals and the other rows the fixture made. Cases are never deleted.

## Tests

| Test | Checks |
|------|--------|
| Confirmed FIPS 06037 | The first run inserts 2 rows: `state_of_residence = 'CA'` and `county_of_residence = 'Los Angeles County'`, both reliability A with method `confirmed_address_fips`. Each ref is the address ref with the FIPS label, and no ref holds the street text. A second run keeps 2 rows and inserts 0. |
| Through the queue | `queue()` with one `financials_propose` message acks it once and never retries it, and the two proposals exist. |
