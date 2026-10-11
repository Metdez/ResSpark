import type { ConnectionStatus } from '../../db/connections'
import { truvFetch } from './client'

export type TruvEmployerStatus = 'pending' | 'sent' | 'completed' | 'error' | 'canceled' | 'expired' | 'no_data' | 'skipped'

export interface TruvEmployer {
  id: string
  status: TruvEmployerStatus | string
  link_id: string | null
  product_type?: string
  data_source?: string
  company?: { name?: string } | null
}

export interface TruvOrder {
  id: string
  bridge_token?: string
  is_expired?: boolean
  expired_at?: string | null
  employers: TruvEmployer[]
}

export interface EmployerSummary {
  employer_id: string
  link_id: string | null
  company_name: string | null
  status: 'pending' | 'connected' | 'done' | 'error'
  fetched_at?: string
  pay_stubs?: number
  w2s?: number
  income_reports?: number
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

export const isTruvOrder = (v: unknown): v is TruvOrder =>
  isObject(v) &&
  typeof v.id === 'string' &&
  Array.isArray(v.employers) &&
  v.employers.every((e) => isObject(e) && typeof e.id === 'string' && typeof e.status === 'string')

// The reconcile read (D-03): the order is the truth, never the webhook payload.
export const getOrder = (env: Env, orderId: string) =>
  truvFetch(env, `/orders/${encodeURIComponent(orderId)}/`, {}, isTruvOrder)

// Unknown statuses (full_parse, login, mfa...) are in progress.
export function mapEmployerStatus(s: string): EmployerSummary['status'] {
  if (s === 'pending' || s === 'sent') return 'pending'
  if (s === 'completed' || s === 'skipped') return 'done'
  if (s === 'error' || s === 'expired' || s === 'canceled' || s === 'no_data') return 'error'
  return 'connected'
}

// PAY-04, checked in this order:
//   every employer completed|skipped, at least one completed  -> done
//   order is_expired                                           -> error (order_expired)
//   any employer pending|sent                                  -> connected if one completed, else pending
//   any employer in an unknown (in-progress) status            -> connected
//   at least one completed, the rest failed                    -> done
//   nothing completed, the rest failed or skipped              -> error
//   no employers yet (open order)                              -> pending
export function mapOrderStatus(order: TruvOrder): { status: ConnectionStatus; code?: string } {
  const raw = order.employers.map((e) => String(e.status))
  const mapped = raw.map(mapEmployerStatus)
  const anyCompleted = raw.includes('completed')
  if (anyCompleted && raw.every((s) => s === 'completed' || s === 'skipped')) return { status: 'done' }
  if (order.is_expired) return { status: 'error', code: 'order_expired' }
  if (raw.length === 0) return { status: 'pending' }
  if (mapped.includes('pending')) return { status: anyCompleted ? 'connected' : 'pending' }
  if (mapped.includes('connected')) return { status: 'connected' }
  if (anyCompleted) return { status: 'done' }
  const failed = raw.find((s) => mapEmployerStatus(s) === 'error')
  return { status: 'error', code: failed ? `employer_${failed}` : 'all_skipped' }
}

// Keyed by employer_id; fetch bookkeeping from earlier runs survives a re-read.
export function summarizeEmployers(order: TruvOrder, previous: EmployerSummary[]): EmployerSummary[] {
  const prior = new Map(previous.map((p) => [p.employer_id, p]))
  return order.employers.map((e) => {
    const p = prior.get(e.id)
    return {
      ...p,
      employer_id: e.id,
      link_id: e.link_id ?? p?.link_id ?? null,
      company_name: e.company?.name ?? p?.company_name ?? null,
      status: mapEmployerStatus(String(e.status)),
    }
  })
}

// Truv wants a 10-digit US number; anything else is omitted rather than rejected.
export const phone10 = (e164: string | null): string | null => {
  const digits = e164?.replace(/^\+1/, '') ?? ''
  return /^\d{10}$/.test(digits) ? digits : null
}

const hasBridgeToken = (v: unknown): v is TruvOrder & { bridge_token: string } =>
  isTruvOrder(v) && typeof v.bridge_token === 'string'

// D-05: income only; Truv never messages the client (ResSpark delivers the link).
export async function createOrder(
  env: Env,
  p: {
    requestId: string
    orderNumber: string
    first: string
    last: string
    email: string | null
    phone10: string | null
    templateId: string | null
  }
): Promise<TruvOrder & { bridge_token: string }> {
  return truvFetch(
    env,
    '/orders/',
    {
      method: 'POST',
      body: {
        products: ['income'],
        first_name: p.first,
        last_name: p.last,
        ...(p.email ? { email: p.email } : {}),
        ...(p.phone10 ? { phone: p.phone10 } : {}),
        external_user_id: p.requestId,
        order_number: p.orderNumber,
        notification_settings: { suppress_user_notifications: true },
        ...(p.templateId ? { template_id: p.templateId } : {}),
      },
    },
    hasBridgeToken
  )
}
