import { api, isObject } from '@/lib/api'
import type { PushState } from '@/components/status-badge'

// Contracts of app/worker/src/routes/admin-logics-push.ts (snake_case JSON, mirrored, not imported).
export type { PushState }
export type PushMode = 'fake' | 'live'

export interface LedgerPush {
  id: string
  document_id: string
  part_index: number
  part_count: number | null
  file_name: string
  state: PushState
  mode: PushMode
  logics_document_id: number | null
  error_code: string | null
  error_detail: string | null
  needs_manual_compression: boolean
  attempts: number
  claimed_at: string | null
  sent_at: string | null
  resolved_by: string | null
  created_at: string
}

export interface LedgerBatch {
  id: string
  created_at: string
  agent_display_name: string
  mode: PushMode
  activity_state: string
  logics_activity_id: number | null
  pushes: LedgerPush[]
}

export interface LedgerResponse {
  mode: PushMode
  batches: LedgerBatch[]
}

export interface CreatePushResponse {
  batch_id: string
  push_ids: string[]
  mode: PushMode
}

export interface ResolveResponse {
  state: string
  new_push_id: string | null
}

const str = (v: unknown) => typeof v === 'string'
const isMode = (v: unknown): v is PushMode => v === 'fake' || v === 'live'
const STATES: readonly unknown[] = ['queued', 'sending', 'sent', 'failed', 'unknown']

const isPush = (v: unknown): v is LedgerPush =>
  isObject(v) &&
  str(v.id) &&
  str(v.document_id) &&
  typeof v.part_index === 'number' &&
  (v.part_count === null || typeof v.part_count === 'number') &&
  str(v.file_name) &&
  STATES.includes(v.state) &&
  isMode(v.mode) &&
  (v.logics_document_id === null || typeof v.logics_document_id === 'number') &&
  typeof v.needs_manual_compression === 'boolean'

const isBatch = (v: unknown): v is LedgerBatch =>
  isObject(v) && str(v.id) && str(v.created_at) && isMode(v.mode) && Array.isArray(v.pushes) && v.pushes.every(isPush)

export const isLedgerResponse = (v: unknown): v is LedgerResponse =>
  isObject(v) && isMode(v.mode) && Array.isArray(v.batches) && v.batches.every(isBatch)

const isCreated = (v: unknown): v is CreatePushResponse =>
  isObject(v) && str(v.batch_id) && Array.isArray(v.push_ids) && isMode(v.mode)

const isResolved = (v: unknown): v is ResolveResponse =>
  isObject(v) && str(v.state) && (v.new_push_id === null || str(v.new_push_id))

const id = encodeURIComponent

export const fetchLedger = (requestId: string) =>
  api('/api/admin/requests/' + id(requestId) + '/logics-pushes', {}, isLedgerResponse)

export const createPush = (requestId: string, body: { document_ids: string[] }) =>
  api('/api/admin/requests/' + id(requestId) + '/logics-push', { method: 'POST', body: JSON.stringify(body) }, isCreated)

export const resolvePush = (pushId: string, body: { action: 'mark_sent' | 'resend'; logics_document_id?: number }) =>
  api(`/api/admin/logics-pushes/${id(pushId)}/resolve`, { method: 'POST', body: JSON.stringify(body) }, isResolved)

// Staff copy per route refusal. logics_write_blocked shows the Worker's own message instead (it names the case).
export const PUSH_ERROR_COPY: Record<string, string> = {
  logics_write_blocked: 'Logics writes are turned off here.',
  logics_no_credentials: 'Logics is not connected. Add the Logics keys in Settings, then try again.',
  already_pushed: 'Already pushed to Logics. Refresh to see its state.',
  not_pushable: 'One of these files is no longer approved and ready. Refresh the page and try again.',
  no_items: 'Select at least one file to push.',
  not_resolvable: 'This file was already resolved. Refresh to see its state.',
}
