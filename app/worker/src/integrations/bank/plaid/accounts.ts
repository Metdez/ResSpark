// D-09 (as corrected by RESEARCH): cash on hand comes from Plaid balances, not from summing transactions.
import type { NormBalance } from '../provider'
import { plaidFetch } from './client'

export type { NormBalance }

interface AccountsGet {
  accounts: Array<{
    account_id: string
    balances?: { current?: number | null; available?: number | null; last_updated_datetime?: string | null } | null
  }>
}

const isAccountsGet = (v: unknown): v is AccountsGet =>
  Array.isArray((v as AccountsGet | null)?.accounts) &&
  (v as AccountsGet).accounts.every((a) => typeof a?.account_id === 'string')

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export async function getAccountBalances(env: Env, accessToken: string): Promise<NormBalance[]> {
  const res = await plaidFetch(env, '/accounts/get', { access_token: accessToken }, isAccountsGet)
  const now = new Date().toISOString()
  return res.accounts.map((a) => ({
    external_account_id: a.account_id,
    current: num(a.balances?.current),
    available: num(a.balances?.available),
    as_of: a.balances?.last_updated_datetime ?? now,
  }))
}
