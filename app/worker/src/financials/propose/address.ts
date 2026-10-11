// Address source (D-12, ADDR-02): state and IRS county only ever come from a USPS-verified FIPS.
import { smartyConfigured, verifyStreet, type StreetInput } from '../../integrations/smarty/client'
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
  if (!fips) return fallback(ctx)
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

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

type Candidate = { input: StreetInput; method: string; ref: SourceRef } | null

// The client's manual (unverified) address. Labels never carry street text.
function manualCandidate(ctx: ProposeContext): Candidate {
  const r = ctx.caseRow
  const [street, city, state, zipcode] = [text(r.address_line1), text(r.city), text(r.state_code), text(r.zip5)]
  if (r.address_source !== 'manual' || !street || !city || !state || !zipcode) return null
  return {
    input: { street, secondary: text(r.address_line2), city, state, zipcode },
    method: 'manual_address_smarty_fips',
    ref: { kind: 'address', id: ctx.caseId, label: 'Manual address verified by USPS' },
  }
}

// The Logics case address; every part must be present.
function logicsCandidate(info: Record<string, unknown> | null): Candidate {
  const [street, city, state, zipcode] = [text(info?.Address), text(info?.City), text(info?.State), text(info?.Zip)]
  if (!street || !city || !state || !zipcode) return null
  return {
    input: { street, secondary: text(info?.AptNo), city, state, zipcode },
    method: 'logics_address_smarty_fips',
    ref: { kind: 'logics_field', id: 'Address', label: 'Logics case address verified by USPS' },
  }
}

// A USPS hit whose FIPS maps to an IRS county -> state and county, reliability B.
async function verified(ctx: ProposeContext, c: Candidate): Promise<ProposalInput[] | null> {
  if (!c) return null
  const v = await verifyStreet(ctx.env, c.input)
  if (!v?.county_fips || !v.state_code) return null
  const hit = await lookupCountyFips(ctx.env, v.county_fips)
  if (hit === 'unmapped' || !hit.county) return null
  const refs = [{ ...c.ref, label: `${c.ref.label}, county FIPS ${v.county_fips}` }]
  return [
    proposal('state_of_residence', v.state_code, 'B', c.method, refs),
    proposal('county_of_residence', hit.county, 'B', c.method, refs),
  ]
}

// D-12 fallback, manual address first, then Logics (read only when needed); nothing verifies -> [].
async function fallback(ctx: ProposeContext) {
  if (!smartyConfigured(ctx.env)) return null
  const proposals =
    (await verified(ctx, manualCandidate(ctx))) ?? (await verified(ctx, logicsCandidate(await ctx.logicsCaseInfo())))
  return { source: 'address' as const, proposals: proposals ?? [] }
}
