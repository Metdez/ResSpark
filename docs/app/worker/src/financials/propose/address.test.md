# `app/worker/src/financials/propose/address.test.ts`

Unit tests for the address proposer. They need no network. The test mocks `smartyConfigured` and `verifyStreet` from `integrations/smarty/client`, and `lookupCountyFips` from `../county`. The real `confirmedFips` is kept. `ctx(caseRow, info)` builds a `ProposeContext` whose `logicsCaseInfo` is a spy that returns `info`.

| Test | Checks |
|------|--------|
| Old Connecticut, confirmed | A map row with county `null` proposes `state_of_residence` only, and Smarty is never called. |
| Not in the IRS table, confirmed | An `'unmapped'` FIPS proposes Smarty's `Hartford` with reliability C and method `smarty_county_name_not_in_irs_table`. |
| Smarty not configured | The fallback returns `null`. |
| Manual address first | One `verifyStreet` call, with the manual street and ZIP. Logics CaseInfo is never read. The result is `TX` and `Travis County`, both reliability B with method `manual_address_smarty_fips`. No street text appears in the output. |
| Logics address second | The manual address gives no match, so the Logics address (`100 Congress Ave`, blank `AptNo` as `null`) is verified. The method is `logics_address_smarty_fips` with a `logics_field`/`Address` ref, and no street text appears. |
| Nothing verifies | `{ source: 'address', proposals: [] }`. |
| A hit with an unmapped county | An old CT FIPS from the fallback proposes nothing. |
| No address at all | `[]`, and Smarty is never called. |
