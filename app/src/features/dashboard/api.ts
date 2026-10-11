import { api, isObject } from '@/lib/api'

// Mirrors worker/src/db/dashboard.ts (contract, not imported).
export const DASHBOARD_STATUSES = [
  'sent',
  'opened',
  'in_progress',
  'waiting_on_staff',
  'complete',
  'revoked',
] as const
export type DashboardStatus = (typeof DASHBOARD_STATUSES)[number]

export interface RequestFilters {
  status?: DashboardStatus
  q?: string
}

export interface DashboardRow {
  id: string
  case_id: string
  status: string
  template_name: string
  agent_display_name: string | null
  client_name: string
  first_name: string | null
  last_name: string | null
  email: string | null
  created_at: string
  sent_at: string | null
  opened_at: string | null
  completed_at: string | null
  expires_at: string | null
  last_activity_at: string | null
  overdue: boolean
}

const STRINGS = [
  'id',
  'case_id',
  'status',
  'template_name',
  'client_name',
  'created_at',
]
const NULLABLE = [
  'agent_display_name',
  'first_name',
  'last_name',
  'email',
  'sent_at',
  'opened_at',
  'completed_at',
  'expires_at',
  'last_activity_at',
]

export const isDashboardRow = (v: unknown): v is DashboardRow =>
  isObject(v) &&
  STRINGS.every((k) => typeof v[k] === 'string') &&
  NULLABLE.every((k) => v[k] === null || typeof v[k] === 'string') &&
  typeof v.overdue === 'boolean'

const isRequestsResponse = (v: unknown): v is { requests: DashboardRow[] } =>
  isObject(v) && Array.isArray(v.requests) && v.requests.every(isDashboardRow)

export function fetchRequests({ status, q }: RequestFilters) {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (q) params.set('q', q)
  const qs = params.toString()
  return api(`/api/admin/requests${qs ? `?${qs}` : ''}`, {}, isRequestsResponse)
}
