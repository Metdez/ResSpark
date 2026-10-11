import type { ProviderId } from '../db/connections'
import { truvConfigured } from './truv/client'

// D-15: an unconfigured provider is a state the UI explains, never a crash.
export function providerConfigured(env: Env, id: ProviderId): boolean {
  if (id === 'truv') return truvConfigured(env)
  if (id === 'plaid') return Boolean(env.PLAID_CLIENT_ID && env.PLAID_SECRET)
  return false
}
