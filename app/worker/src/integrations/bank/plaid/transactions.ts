import { ProviderError } from '../../provider-error'
import type { BankProvider, NormAccount, NormTransaction, SyncUpdateStatus } from '../provider'
import { plaidFetch } from './client'

export interface PlaidTransaction {
  transaction_id: string
  account_id: string
  amount: number
  iso_currency_code?: string | null
  date: string
  authorized_date?: string | null
  name?: string | null
  merchant_name?: string | null
  personal_finance_category?: { primary?: string | null; detailed?: string | null } | null
  pending?: boolean
}

interface PlaidAccount {
  account_id: string
  mask?: string | null
  name?: string | null
  official_name?: string | null
  type?: string | null
  subtype?: string | null
}

interface SyncPage {
  added: PlaidTransaction[]
  modified: PlaidTransaction[]
  removed: Array<{ transaction_id: string }>
  accounts?: PlaidAccount[]
  has_more: boolean
  next_cursor: string
  transactions_update_status?: string
}

export const normalizeTransaction = (t: PlaidTransaction): NormTransaction => ({
  plaid_transaction_id: t.transaction_id,
  external_account_id: t.account_id,
  amount: t.amount,
  iso_currency_code: t.iso_currency_code ?? null,
  date: t.date,
  authorized_date: t.authorized_date ?? null,
  name: t.name ?? null,
  merchant_name: t.merchant_name ?? null,
  category_primary: t.personal_finance_category?.primary ?? null,
  category_detailed: t.personal_finance_category?.detailed ?? null,
  pending: t.pending ?? false,
})

export const normalizeAccount = (a: PlaidAccount): NormAccount => ({
  external_account_id: a.account_id,
  mask: a.mask ?? null,
  name: a.name ?? null,
  official_name: a.official_name ?? null,
  type: a.type ?? null,
  subtype: a.subtype ?? null,
})

export const mapUpdateStatus = (s: string): SyncUpdateStatus =>
  s === 'HISTORICAL_UPDATE_COMPLETE' ? 'historical' : s === 'INITIAL_UPDATE_COMPLETE' ? 'initial' : 'not_ready'

const MAX_RESTARTS = 3

// RESEARCH Code Example 7: page until has_more is false; a mutation mid-pagination restarts the
// whole loop from the original cursor (Plaid's documented recovery).
export const syncTransactions: BankProvider['syncTransactions'] = async (env, accessToken, cursor) => {
  for (let attempt = 0; ; attempt++) {
    const added: PlaidTransaction[] = []
    const modified: PlaidTransaction[] = []
    const removed: string[] = []
    let next = cursor
    try {
      for (;;) {
        const page = await plaidFetch<SyncPage>(env, '/transactions/sync', {
          access_token: accessToken,
          cursor: next,
          count: 500,
          options: { personal_finance_category_version: 'v2' },
        })
        added.push(...page.added)
        modified.push(...page.modified)
        removed.push(...page.removed.map((r) => r.transaction_id))
        next = page.next_cursor
        if (!page.has_more) {
          const raw = page.transactions_update_status ?? 'NOT_READY'
          return {
            added: added.map(normalizeTransaction),
            modified: modified.map(normalizeTransaction),
            removed,
            cursor: page.next_cursor,
            status: mapUpdateStatus(raw),
            statusRaw: raw,
            accounts: (page.accounts ?? []).map(normalizeAccount),
          }
        }
      }
    } catch (e) {
      const restart = e instanceof ProviderError && e.code === 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION'
      if (!restart || attempt >= MAX_RESTARTS) throw e
    }
  }
}
