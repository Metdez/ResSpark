# `app/worker/src/financials/propose/address.ts`

The `address` proposer (D-12, ADDR-02). It proposes `state_of_residence` and `county_of_residence`, and it only ever uses an address's USPS county FIPS to do so. The county value is the IRS housing table's own name, read from `county_fips_map`, so the standards lookup matches it exactly.

| Part | What it does |
|------|--------------|
| `proposal(column, value, reliability, method, refs)` | Builds one `ProposalInput` with no window. |
| `proposeAddress(ctx)` | The proposer. It returns `{ source: 'address', proposals }`, or `null` when it cannot run. |

## Confirmed Smarty address

This branch runs when `confirmedFips(ctx.caseRow)` returns a FIPS, which means the client confirmed a Smarty address. Every proposal carries one ref: `{ kind: 'address', id: <case id>, label: 'USPS-verified address, county FIPS <fips>' }`. The label never holds street text.

| Map lookup | Proposals |
|------------|-----------|
| Row with a county | `state_of_residence` = `cases.state_code` (A) and `county_of_residence` = the map's county (A), both with method `confirmed_address_fips`. For example, 06037 gives `CA` and `Los Angeles County`. |
| Row with county NULL (old Connecticut) | `state_of_residence` only. The county stays Needs data, and nothing is guessed. |
| No row | `state_of_residence` (A), plus Smarty's `county_name` as `county_of_residence` with reliability C and method `smarty_county_name_not_in_irs_table`. Staff see this as the "not in IRS table" warning (open question 4). |

## No confirmed Smarty address

In this version the proposer returns `null`, so the job keeps any old rows. Task 2 of Plan 07-05 adds the manual and Logics address fallback.
