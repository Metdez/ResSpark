import { createAdminClient } from '../../db/client'
import {
  insertConnection,
  latestConnectionForItem,
  recordConnectionEvent,
  setConnectionStatus,
  updateConnection,
} from '../../db/connections'
import type { ItemRow } from '../../db/documents'
import type { ClientCtx } from '../../middleware/client-session'
import { ProviderError } from '../provider-error'
import { createOrder, getOrder, phone10, summarizeEmployers, type EmployerSummary } from './orders'

export interface StartCtx {
  client: ClientCtx
  item: ItemRow
  caseRow: { id: string; first_name: string | null; last_name: string | null; email: string | null; phone_e164: string | null }
}

const employersOf = (data: Record<string, unknown>) =>
  Array.isArray(data.employers) ? (data.employers as EmployerSummary[]) : []

async function truvConnectionCount(env: Env, itemId: string): Promise<number> {
  const { count, error } = await createAdminClient(env)
    .from('connections')
    .select('id', { count: 'exact', head: true })
    .eq('request_item_id', itemId)
    .eq('provider', 'truv')
  if (error) throw new Error('connection_count_failed')
  return count ?? 0
}

// D-05 / PAY-01: one open order per item, reused across taps so a second employer joins it.
export async function startPayroll(
  env: Env,
  ctx: StartCtx
): Promise<{ connection_id: string; bridge_token: string; reused: boolean }> {
  const { client, item, caseRow } = ctx
  const existing = await latestConnectionForItem(env, item.id)
  if (existing?.provider === 'truv' && ['pending', 'connected'].includes(existing.status) && existing.external_id) {
    const order = await getOrder(env, existing.external_id)
    if (order.is_expired || !order.bridge_token) {
      await setConnectionStatus(env, existing.id, 'error', { code: 'order_expired' })
    } else {
      await updateConnection(env, existing.id, {
        data: { ...existing.data, employers: summarizeEmployers(order, employersOf(existing.data)) },
      })
      return { connection_id: existing.id, bridge_token: order.bridge_token, reused: true }
    }
  }

  // Row before URL: the connection exists before Truv knows about it.
  const prior = await truvConnectionCount(env, item.id)
  const conn = await insertConnection(env, {
    firm_id: client.firmId,
    request_id: client.requestId,
    request_item_id: item.id,
    case_id: caseRow.id,
    provider: 'truv',
    kind: 'payroll',
  })
  // shortcut: D-05 names order_number = request id; Truv's uniqueness rule for order_number is
  // undocumented, so re-creates after an expiry get a -n suffix. Drop the suffix if Truv allows reuse.
  const orderNumber = prior === 0 ? client.requestId : `${client.requestId}-${prior + 1}`
  let order: Awaited<ReturnType<typeof createOrder>>
  try {
    order = await createOrder(env, {
      requestId: client.requestId,
      orderNumber,
      first: caseRow.first_name ?? 'Client',
      last: caseRow.last_name ?? 'Unknown',
      email: caseRow.email,
      phone10: phone10(caseRow.phone_e164),
      templateId: env.TRUV_TEMPLATE_ID || null,
    })
  } catch (e) {
    if (e instanceof ProviderError) await setConnectionStatus(env, conn.id, 'error', { code: e.code })
    throw e
  }
  await updateConnection(env, conn.id, {
    external_id: order.id,
    data: { employers: summarizeEmployers(order, []), order_expired_at: order.expired_at ?? null },
  })
  await recordConnectionEvent(env, conn.id, 'connection.started', { provider: 'truv', reused: false }, {
    type: 'client',
    id: `link:${client.linkId}`,
  })
  return { connection_id: conn.id, bridge_token: order.bridge_token, reused: false }
}
