import type { ProviderId } from '../../db/connections'
import { NonRetryableError } from '../provider-error'
import { plaidProvider } from './plaid/index'
import type { BankProvider } from './provider'

export const plaidConfigured = (env: Env) => Boolean(env.PLAID_CLIENT_ID && env.PLAID_SECRET)

// D-11 / BANK-04: the one place a provider id is read; callers branch on `capabilities`.
export function bankProvider(env: Env, id?: ProviderId): BankProvider {
  if ((id ?? env.BANK_PROVIDER) === 'plaid') return plaidProvider
  throw new NonRetryableError('unknown_provider')
}
