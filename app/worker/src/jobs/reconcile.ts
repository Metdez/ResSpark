import {
  findConnectionByEmployerLink,
  findConnectionByExternalId,
  findConnectionByLinkRef,
  getConnection,
  recordConnectionEvent,
  updateConnection,
  type ConnectionStatus,
} from '../db/connections'
import type { WebhookEventRow } from '../db/webhook-events'
import { NonRetryableError } from '../integrations/provider-error'
import { reconcileBank } from './bank-reconcile'
import { reconcilePayroll } from './payroll-reconcile'
import { reconcileSignature } from './signature-reconcile'

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
  let res: { status: ConnectionStatus; applied: boolean }
  try {
    if (conn.kind === 'payroll') res = await reconcilePayroll(env, conn, opts)
    else if (conn.kind === 'signature') return await reconcileSignature(env, conn, opts)
    else res = await reconcileBank(env, conn, opts)
  } finally {
    await updateConnection(env, conn.id, { last_polled_at: new Date().toISOString() })
  }
  // D-07: fresh proposals once payroll or bank data is complete. A queue failure never fails the reconcile.
  if (res.status === 'done' && res.applied) {
    try {
      await env.JOBS.send({ type: 'financials_propose', ref: conn.case_id, reason: 'connection_done' })
    } catch {
      await recordConnectionEvent(env, conn.id, 'connection.enqueue_failed', { reason: 'connection_done' }, { type: 'system' }).catch(() => {})
    }
  }
  return res
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
  if (event.provider === 'docuseal') {
    // data.id is the submitter; the connection's external_id is the submission (RESEARCH contradiction 5)
    const sub = (p.data as { submission_id?: unknown } | undefined)?.submission_id
    if (!Number.isInteger(sub)) return null
    return (await findConnectionByExternalId(env, 'docuseal', String(sub)))?.id ?? null
  }
  return null
}
