import { PROVIDER_CAPABILITIES, type BankProvider } from '../provider'
import { plaidFetch } from './client'
import { completeSession, createLinkSession } from './link'
import { downloadStatement, listStatements } from './statements'
import { syncTransactions } from './transactions'

export const plaidProvider: BankProvider = {
  id: 'plaid',
  capabilities: PROVIDER_CAPABILITIES.plaid!,
  createLinkSession,
  completeSession,
  syncTransactions,
  listStatements,
  downloadStatement,
  async removeConnection(env, accessToken) {
    await plaidFetch(env, '/item/remove', { access_token: accessToken })
  },
}
