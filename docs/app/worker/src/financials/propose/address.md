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

## No confirmed Smarty address (fallback)

This covers the case where there is no confirmed address yet, or the client typed a manual address, which is unverified (open question 5). The proposer then verifies other addresses server-side through Phase 6's `verifyStreet`.

| Part | What it does |
|------|--------------|
| `text(v)` | A trimmed non-blank string, or `null`. |
| `Candidate` | `{ input, method, ref }` for one address to verify, or `null`. |
| `manualCandidate(ctx)` | The client's manual address (`address_source = 'manual'` with `address_line1`, `city`, `state_code` and `zip5`). Method `manual_address_smarty_fips`, ref `{ kind: 'address', id: <case id> }`. |
| `logicsCandidate(info)` | The Logics CaseInfo address (`Address`, `AptNo`, `City`, `State`, `Zip`). Every part except `AptNo` must be non-blank. Method `logics_address_smarty_fips`, ref `{ kind: 'logics_field', id: 'Address' }`. |
| `verified(ctx, candidate)` | Calls `verifyStreet`. A hit with a `county_fips` and `state_code` whose FIPS maps to a county becomes `state_of_residence` (the verified `state_code`) and `county_of_residence` (the IRS county), both reliability B. Any other result is `null`. The ref label adds `, county FIPS <fips>` and never holds street text. |
| `fallback(ctx)` | Smarty not configured: `null`, so the source is skipped and old rows are kept. Otherwise it tries the manual address first. Only if that gives nothing does it read Logics CaseInfo (memoized) and try the Logics address. Nothing verifies: `[]`, so no county proposal exists and GET financials reports `waiting_for_address`. |

A Smarty vendor error propagates. The job retries a transient one and marks a permanent one `failed`.
