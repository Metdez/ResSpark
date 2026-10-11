import {
  findConnectionByEmployerLink,
  findConnectionByExternalId,
  findConnectionByLinkRef,
  getConnection,
  updateConnection,
  type ConnectionStatus,
} from '../db/connections'
import type { WebhookEventRow } from '../db/webhook-events'
import { NonRetryableError } from '../integrations/provider-error'
import { reconcileBank } from './bank-reconcile'
import { reconcilePayroll } from './payroll-reconcile'

export interface ReconcileOpts {
  source: 'webhook' | 'cron' | 'client' | 'staff'
  hint?: Record<string, unknown>
  actorId?: string
}

// D-04: the one function behind the webhook consumer, the cron, the client return and staff Refresh.
export async function reconcileConnection(
  env: Env,
  connectionId: string,
  opts: ReconcileOpts
): Promise<{ status: ConnectionStatus; applied: boolean }> {
  const conn = await getConnection(env, connectionId)
  if (!conn) throw new NonRetryableError('connection_not_found')
  if (conn.status === 'removed') return { status: 'removed', applied: false }
  try {
    if (conn.kind === 'payroll') return await reconcilePayroll(env, conn, opts)
    return await reconcileBank(env, conn, opts)
  } finally {
    await updateConnection(env, conn.id, { last_polled_at: new Date().toISOString() })
  }
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : null)

// Which connection a verified webhook is about. 'unmatched_payroll': a Truv task event whose
// link_id is not stored yet (the first events of a new order) — the caller reconciles all open
// payroll connections instead of dropping it.
export async function connectionIdForWebhook(env: Env, event: WebhookEventRow): Promise<string | 'unmatched_payroll' | null> {
  const p = event.payload
  if (event.provider === 'truv') {
    const orderId = str(p.order_id)
    const byOrder = orderId ? await findConnectionByExternalId(env, 'truv', orderId) : null
    if (byOrder) return byOrder.id
    const linkId = str(p.link_id)
    const byLink = linkId ? await findConnectionByEmployerLink(env, linkId) : null
    return byLink ? byLink.id : 'unmatched_payroll'
  }
  if (event.provider === 'plaid') {
    const linkToken = str(p.link_token)
    const byLink = linkToken ? await findConnectionByLinkRef(env, linkToken) : null
    if (byLink) return byLink.id
    const itemId = str(p.item_id)
    const byItem = itemId ? await findConnectionByExternalId(env, 'plaid', itemId) : null
    return byItem?.id ?? null
  }
  return null
}
