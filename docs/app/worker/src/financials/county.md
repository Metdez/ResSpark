# `app/worker/src/financials/county.ts`

This module turns a USPS-verified address into the IRS county name, and it builds the county block that staff see in GET financials (D-12, ADDR-02). The county can only come from an address through its Census FIPS code. Nothing lets staff or the client pick or type a county.

| Part | What it does |
|------|--------------|
| `ADDRESS_COLUMNS` | The `cases` address columns from Phase 6 (migration 0007), as a PostgREST select list. The propose job and the GET financials route both read them. |
| `CountyMapHit` | Either the `county_fips_map` row (`state`, `county`, `note`) or `'unmapped'` when no row has this FIPS. A row with `county = NULL` is an old Connecticut county. Connecticut replaced its counties with planning regions in 2022, and the IRS tables use the regions. |
| `CountyBlock` | What GET financials returns as `county`: `status`, `state_code`, `county_fips`, `smarty_county` (Smarty's own `county_name`), `irs_county`, `address_source` and `address_verified`. |
| `str(v)` | A trimmed non-blank string, or `null`. |
| `confirmedFips(caseRow)` | Returns the case's FIPS only when the client confirmed a Smarty address (`address_confirmed_at` set, `address_source = 'smarty'`, a 5-digit `county_fips`). Otherwise it returns `null`. A manual address is unverified, so it never counts (open question 5). |
| `lookupCountyFips(env, fips)` | Reads `county_fips_map` by FIPS with the admin client. A FIPS that is not 5 digits is `'unmapped'` and is never sent to the database. A database error throws `county_lookup_failed`. |
| `countyBlock(caseRow, mapHit, countyProposal)` | A pure function that derives the status, using the rules below. |
| `loadCountyBlock(env, firmId, caseId, proposals)` | The GET financials reader. It reads the case's `ADDRESS_COLUMNS` filtered by firm and id, looks up the map only when `confirmedFips` returns a FIPS, and picks the first (newest) `address` `county_of_residence` row from `proposals`, which `listProposals` returns newest first. Then it calls `countyBlock`. |

## Status rules

| Condition | `status` | `irs_county` |
|-----------|----------|--------------|
| Confirmed Smarty FIPS, map row with a county | `confirmed_address` | The map's county, for example `Los Angeles County` for 06037 |
| Confirmed Smarty FIPS, map row with county NULL | `ct_old_county` | `null` (the county stays Needs data) |
| Confirmed Smarty FIPS, no map row | `not_in_irs_table` | `null` (the proposal carries Smarty's name with reliability C) |
| No confirmed FIPS, and the latest `address` county proposal used method `manual_address_*` or `logics_address_*` | `from_other_address` | The proposed county |
| Anything else | `waiting_for_address` | `null` |

`countyProposal` is the newest non-superseded `county_of_residence` proposal from the `address` source. The caller passes it in. `mapHit` is `null` when the caller did not look up a FIPS.
