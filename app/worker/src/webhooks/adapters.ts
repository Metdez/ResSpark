import { docusealAdapter } from './docuseal'
import { plaidAdapter } from './plaid'
import { truvAdapter } from './truv'
import type { WebhookAdapter } from './types'

// POST /api/webhooks/:provider resolves its verifier here.
export const adapters: Readonly<Record<string, WebhookAdapter>> = {
  plaid: plaidAdapter,
  truv: truvAdapter,
  docuseal: docusealAdapter,
}
