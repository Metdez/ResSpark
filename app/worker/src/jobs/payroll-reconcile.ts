import { setConnectionStatus, updateConnection, type ConnectionRow, type ConnectionStatus } from '../db/connections'
import { getOrder, mapOrderStatus, summarizeEmployers, type EmployerSummary } from '../integrations/truv/orders'
import type { ReconcileOpts } from './reconcile'

// Re-read the Truv order and apply it. Plan 03 adds the per-employer report/file fetch
// between the summary write and the status write.
export async function reconcilePayroll(
  env: Env,
  conn: ConnectionRow,
  opts: ReconcileOpts
): Promise<{ status: ConnectionStatus; applied: boolean }> {
  if (!conn.external_id) return { status: conn.status, applied: false } // order not created yet
  const order = await getOrder(env, conn.external_id)
  const previous = Array.isArray(conn.data.employers) ? (conn.data.employers as EmployerSummary[]) : []
  const employers = summarizeEmployers(order, previous)
  await updateConnection(env, conn.id, { data: { ...conn.data, employers, order_expired_at: order.expired_at ?? null } })
  const { status, code } = mapOrderStatus(order)
  const res = await setConnectionStatus(env, conn.id, status, code ? { code } : {}, opts.actorId)
  return { status: res.status, applied: res.applied }
}
