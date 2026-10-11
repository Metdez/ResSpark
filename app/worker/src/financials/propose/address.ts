// Address source (D-12, ADDR-02): state and IRS county only ever come from a USPS-verified FIPS.
import { confirmedFips, lookupCountyFips } from '../county'
import type { ProposalInput, Reliability, SourceRef } from '../rpc'
import type { ProposeContext } from './run'

const proposal = (column: string, value: string, reliability: Reliability, method: string, refs: SourceRef[]): ProposalInput => ({
  canonical_column: column,
  proposed_value: value,
  source_refs: refs,
  method,
  window_start: null,
  window_end: null,
  reliability,
})

export async function proposeAddress(ctx: ProposeContext) {
  const row = ctx.caseRow
  const fips = confirmedFips(row)
  // Task 2 adds the manual / Logics address fallback.
  if (!fips) return null
  // Refs never carry street text.
  const refs: SourceRef[] = [{ kind: 'address', id: ctx.caseId, label: `USPS-verified address, county FIPS ${fips}` }]
  const out: ProposalInput[] = []
  const state = typeof row.state_code === 'string' ? row.state_code : null
  if (state) out.push(proposal('state_of_residence', state, 'A', 'confirmed_address_fips', refs))
  const hit = await lookupCountyFips(ctx.env, fips)
  const smartyCounty = typeof row.county_name === 'string' && row.county_name.trim() ? row.county_name.trim() : null
  if (hit === 'unmapped') {
    // Open question 4: Smarty's name with a warning; staff decide.
    if (smartyCounty) out.push(proposal('county_of_residence', smartyCounty, 'C', 'smarty_county_name_not_in_irs_table', refs))
  } else if (hit.county) {
    out.push(proposal('county_of_residence', hit.county, 'A', 'confirmed_address_fips', refs))
  } // county NULL = old Connecticut county: state only, the county stays Needs data.
  return { source: 'address' as const, proposals: out }
}
