import { ProviderError } from '../../provider-error'
import type { BankProvider } from '../provider'
import { plaidFetch, plaidRaw } from './client'
import { normalizeAccount } from './transactions'

interface ListResponse {
  accounts: Array<{
    account_id: string
    account_mask?: string | null
    account_name?: string | null
    account_official_name?: string | null
    account_type?: string | null
    account_subtype?: string | null
    statements: Array<{ statement_id: string; year: number; month: number }>
  }>
}

export async function refreshStatements(env: Env, accessToken: string, window: { start: string; end: string }): Promise<void> {
  await plaidFetch(env, '/statements/refresh', { access_token: accessToken, start_date: window.start, end_date: window.end })
}

// PRODUCTS_NOT_SUPPORTED: this bank has no statements (cells become not_supported).
// PRODUCT_NOT_READY: statements are still being prepared (cells stay pending; cron retries).
export const listStatements: BankProvider['listStatements'] = async (env, accessToken, opts) => {
  try {
    if (opts?.requestRefresh) await refreshStatements(env, accessToken, opts.requestRefresh)
    const res = await plaidFetch<ListResponse>(env, '/statements/list', { access_token: accessToken })
    return {
      supported: true,
      ready: true,
      accounts: res.accounts.map((a) => ({
        ...normalizeAccount({
          account_id: a.account_id,
          mask: a.account_mask,
          name: a.account_name,
          official_name: a.account_official_name,
          type: a.account_type,
          subtype: a.account_subtype,
        }),
        statements: a.statements.map((s) => ({ id: s.statement_id, year: s.year, month: s.month })),
      })),
    }
  } catch (e) {
    if (e instanceof ProviderError && e.code === 'PRODUCTS_NOT_SUPPORTED') return { supported: false, ready: true, accounts: [] }
    if (e instanceof ProviderError && e.code === 'PRODUCT_NOT_READY') return { supported: true, ready: false, accounts: [] }
    throw e
  }
}

export const downloadStatement: BankProvider['downloadStatement'] = async (env, accessToken, statementId) => {
  const res = await plaidRaw(env, '/statements/download', { access_token: accessToken, statement_id: statementId })
  return { bytes: await res.arrayBuffer(), sha256: res.headers.get('Plaid-Content-Hash') }
}
