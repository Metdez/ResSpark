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
