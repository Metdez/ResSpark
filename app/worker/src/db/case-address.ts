import type { VerifiedAddress } from '../integrations/smarty/client'
import { createAdminClient } from './client'

type DbEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>

export type AddressSource = 'smarty' | 'manual'
export type AddressPayload = VerifiedAddress & { source: AddressSource; verified: boolean }

// The bare RAISE tokens of case_confirm_address (migration 0007).
const TOKENS = ['link_inactive', 'item_not_found', 'item_approved', 'bad_address'] as const

// One transaction: case columns, item → submitted, address.confirmed event, request status.
export async function confirmAddress(
  env: DbEnv,
  p: { itemId: string; linkId: string; address: AddressPayload }
): Promise<{ item_status: string; request_status: string }> {
  const { data, error } = await createAdminClient(env).rpc('case_confirm_address', {
    p_item_id: p.itemId,
    p_link_id: p.linkId,
    p_address: p.address,
  })
  if (error) {
    const words = (error.message ?? '').split(/\W+/)
    throw new Error(TOKENS.find((t) => words.includes(t)) ?? 'address_failed')
  }
  return data as { item_status: string; request_status: string }
}

export interface CaseAddressView {
  line1: string
  line2: string | null
  city: string | null
  state_code: string | null
  zip5: string | null
  zip4: string | null
  county_name: string | null
  county_fips: string | null
  rdi: 'Residential' | 'Commercial' | null
  dpv: string | null
  verified: boolean
  source: AddressSource
  confirmed_at: string
}

// Staff read model (D-07). The caller has already scoped caseId to the staff firm (getFirmRequest).
export async function getCaseAddress(env: DbEnv, caseId: string): Promise<CaseAddressView | null> {
  const { data, error } = await createAdminClient(env)
    .from('cases')
    .select(
      'address_line1, address_line2, city, state_code, zip5, zip4, county_name, county_fips, address_rdi, address_dpv, address_verified, address_source, address_confirmed_at'
    )
    .eq('id', caseId)
    .maybeSingle()
  if (error) throw new Error('address_lookup_failed')
  if (!data || !data.address_confirmed_at || !data.address_line1) return null
  return {
    line1: data.address_line1,
    line2: data.address_line2,
    city: data.city,
    state_code: data.state_code,
    zip5: data.zip5,
    zip4: data.zip4,
    county_name: data.county_name,
    county_fips: data.county_fips,
    rdi: data.address_rdi,
    dpv: data.address_dpv,
    verified: data.address_verified,
    source: data.address_source,
    confirmed_at: data.address_confirmed_at,
  }
}
