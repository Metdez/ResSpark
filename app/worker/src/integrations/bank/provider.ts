import type { ProviderId } from '../../db/connections'

// D-11 / BANK-04: the bank contract. The UI reads `capabilities`, never `id`.
export interface BankCapabilities {
  transactions: boolean
  statementPdfs: boolean
  hostedLink: boolean
}

export const PROVIDER_CAPABILITIES: Readonly<Record<ProviderId, BankCapabilities | null>> = {
  plaid: { transactions: true, statementPdfs: true, hostedLink: true },
  teller: { transactions: true, statementPdfs: false, hostedLink: false },
  truv: null,
}

export interface NormAccount {
  external_account_id: string
  mask: string | null
  name: string | null
  official_name: string | null
  type: string | null
  subtype: string | null
}

export interface NormTransaction {
  plaid_transaction_id: string
  external_account_id: string
  amount: number
  iso_currency_code: string | null
  date: string
  authorized_date: string | null
  name: string | null
  merchant_name: string | null
  category_primary: string | null
  category_detailed: string | null
  pending: boolean
}

export type SyncUpdateStatus = 'not_ready' | 'initial' | 'historical'

export interface BankProvider {
  id: 'plaid' | 'teller'
  capabilities: BankCapabilities
  createLinkSession(
    env: Env,
    p: {
      connectionId: string
      firmName: string
      webhookUrl: string
      returnUrl: string
      statementsStart: string
      statementsEnd: string
    }
  ): Promise<{ linkRef: string; url: string; expiresAt: string }>
  completeSession(
    env: Env,
    p: { linkRef: string; publicTokens?: string[] }
  ): Promise<Array<{ accessToken: string; externalId: string; institutionName: string | null }>>
  syncTransactions(
    env: Env,
    accessToken: string,
    cursor: string | null
  ): Promise<{
    added: NormTransaction[]
    modified: NormTransaction[]
    removed: string[]
    cursor: string
    status: SyncUpdateStatus
    accounts: NormAccount[]
  }>
  listStatements(
    env: Env,
    accessToken: string,
    opts?: { requestRefresh?: { start: string; end: string } }
  ): Promise<{
    supported: boolean
    ready: boolean
    accounts: Array<NormAccount & { statements: Array<{ id: string; year: number; month: number }> }>
  }>
  downloadStatement(env: Env, accessToken: string, statementId: string): Promise<{ bytes: ArrayBuffer; sha256: string | null }>
  removeConnection(env: Env, accessToken: string): Promise<void>
}
