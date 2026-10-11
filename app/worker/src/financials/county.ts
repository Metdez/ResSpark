// County from an address only (D-12, ADDR-02): Census FIPS -> the IRS housing table's own county name.
import { createAdminClient } from '../db/client'

type DbEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>

export const ADDRESS_COLUMNS =
  'address_line1, address_line2, city, state_code, zip5, county_name, county_fips, address_verified, address_source, address_confirmed_at'

export type CountyMapHit = { state: string; county: string | null; note: string | null } | 'unmapped'

export interface CountyBlock {
  status: 'confirmed_address' | 'from_other_address' | 'not_in_irs_table' | 'ct_old_county' | 'waiting_for_address'
  state_code: string | null
  county_fips: string | null
  smarty_county: string | null
  irs_county: string | null
  address_source: 'smarty' | 'manual' | null
  address_verified: boolean
}

const FIPS = /^\d{5}$/
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

// A client-confirmed USPS (Smarty) address with a FIPS; a manual address never counts (open question 5).
export function confirmedFips(caseRow: Record<string, unknown>): string | null {
  const fips = str(caseRow.county_fips)
  return caseRow.address_confirmed_at && caseRow.address_source === 'smarty' && fips && FIPS.test(fips) ? fips : null
}

// 'unmapped' = no row for this FIPS; a row with county NULL is an old Connecticut county.
export async function lookupCountyFips(env: DbEnv, fips: string): Promise<CountyMapHit> {
  if (!FIPS.test(fips)) return 'unmapped'
  const { data, error } = await createAdminClient(env)
    .from('county_fips_map')
    .select('state, county, note')
    .eq('county_fips', fips)
    .maybeSingle()
  if (error) throw new Error('county_lookup_failed')
  return data ?? 'unmapped'
}

export function countyBlock(
  caseRow: Record<string, unknown>,
  mapHit: CountyMapHit | null,
  countyProposal: { method: string; proposed_value: unknown } | null
): CountyBlock {
  const source = caseRow.address_source
  const base = {
    state_code: str(caseRow.state_code),
    county_fips: str(caseRow.county_fips),
    smarty_county: str(caseRow.county_name),
    address_source: source === 'smarty' || source === 'manual' ? source : null,
    address_verified: caseRow.address_verified === true,
  } as const
  if (confirmedFips(caseRow) && mapHit) {
    if (mapHit === 'unmapped') return { ...base, status: 'not_in_irs_table', irs_county: null }
    if (mapHit.county === null) return { ...base, status: 'ct_old_county', irs_county: null }
    return { ...base, status: 'confirmed_address', irs_county: mapHit.county }
  }
  const value = countyProposal?.proposed_value
  if (countyProposal && /^(manual|logics)_address/.test(countyProposal.method) && typeof value === 'string') {
    return { ...base, status: 'from_other_address', irs_county: value }
  }
  return { ...base, status: 'waiting_for_address', irs_county: null }
}
