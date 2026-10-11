import { api, isObject } from '@/lib/api'

// Contract of app/worker/src/routes/admin-events.ts (snake_case JSON, mirrored, not imported).
export type ActorType = 'staff' | 'client' | 'system' | 'provider'

export interface EventRow {
  id: number // events.id is BIGINT; PostgREST sends it as a JSON number
  actor_type: ActorType
  action: string
  payload: Record<string, unknown>
  created_at: string
}

export interface EventsResponse {
  events: EventRow[]
  next_before: string | null
}

const ACTORS: readonly string[] = ['staff', 'client', 'system', 'provider']

const isEvent = (v: unknown): v is EventRow =>
  isObject(v) &&
  typeof v.id === 'number' &&
  typeof v.actor_type === 'string' &&
  ACTORS.includes(v.actor_type) &&
  typeof v.action === 'string' &&
  isObject(v.payload) &&
  typeof v.created_at === 'string'

export const isEventsResponse = (v: unknown): v is EventsResponse =>
  isObject(v) &&
  Array.isArray(v.events) &&
  v.events.every(isEvent) &&
  (v.next_before === null || typeof v.next_before === 'string')

export const fetchEvents = (caseId: string, before?: string) =>
  api(
    `/api/admin/cases/${encodeURIComponent(caseId)}/events${before ? `?before=${encodeURIComponent(before)}` : ''}`,
    {},
    isEventsResponse
  )
