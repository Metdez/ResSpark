import { plaidAdapter } from './plaid'
import { truvAdapter } from './truv'
import type { WebhookAdapter } from './types'

// POST /api/webhooks/:provider resolves its verifier here. DocuSeal joins in Phase 6.
export const adapters: Readonly<Record<string, WebhookAdapter>> = {
  plaid: plaidAdapter,
  truv: truvAdapter,
}
