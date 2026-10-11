import type { UploadErrorCode } from '@/features/uploads/copy'
// Contracts of the Worker's /api/c/* routes (Plan 02-07), mirrored, not imported. The client bundle
// never imports the admin api() or supabase-js: identity is the HttpOnly rs_client cookie only.
export type StepKind =
  | 'bank_connect'
  | 'payroll_connect'
  | 'address'
  | 'upload'
  | 'signature'
  | 'intake'

export type StepStatus =
  | 'pending'
  | 'in_progress'
  | 'submitted'
  | 'approved'
  | 'rejected'

export interface PortalStep {
  id: string
  position: number
  kind: StepKind
  label: string
  required: boolean
  status: StepStatus
}

export interface PortalState {
  firm_name: string
  agent_display_name: string | null
  status: string
  opened_at: string | null
  expires_at: string
  steps: PortalStep[]
}

export class PortalError extends Error {
  constructor(
    public status: number,
    public code: string
  ) {
    super(code)
    this.name = 'PortalError'
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isStep = (v: unknown): v is PortalStep =>
  isObject(v) &&
  typeof v.id === 'string' &&
  typeof v.position === 'number' &&
  typeof v.kind === 'string' &&
  typeof v.label === 'string' &&
  typeof v.required === 'boolean' &&
  typeof v.status === 'string'

export const isPortalState = (v: unknown): v is PortalState =>
  isObject(v) &&
  typeof v.firm_name === 'string' &&
  (v.agent_display_name === null || typeof v.agent_display_name === 'string') &&
  typeof v.status === 'string' &&
  (v.opened_at === null || typeof v.opened_at === 'string') &&
  typeof v.expires_at === 'string' &&
  Array.isArray(v.steps) &&
  v.steps.every(isStep)

const isOpened = (v: unknown): v is { opened_at: string } =>
  isObject(v) && typeof v.opened_at === 'string'

const isOk = (v: unknown): v is { ok: true } => isObject(v) && v.ok === true

export async function portalFetch<T>(
  path: string,
  init: RequestInit & { headers?: Record<string, string> },
  guard: (v: unknown) => v is T
): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: {
      'content-type': 'application/json',
      'X-Requested-With': 'ResSpark',
      ...init.headers,
    },
  })
  const body: unknown = await res.json().catch(() => undefined)
  if (!res.ok) {
    const code =
      isObject(body) &&
      isObject(body.error) &&
      typeof body.error.code === 'string'
        ? body.error.code
        : 'http_error'
    throw new PortalError(res.status, code)
  }
  if (!guard(body)) throw new PortalError(500, 'invalid_response')
  return body
}

export const getState = () => portalFetch('/api/c/state', {}, isPortalState)

export const start = () =>
  portalFetch('/api/c/start', { method: 'POST' }, isOpened)

export type HeartbeatBody = {
  last_step: string
  last_error?: 'state_failed' | 'start_failed' | UploadErrorCode
  user_agent_class: 'phone' | 'tablet' | 'desktop'
}

// Never rejects: a lost heartbeat only delays the staff-side "last seen".
export async function heartbeat(
  body: HeartbeatBody
): Promise<'ok' | 'rate_limited' | 'failed'> {
  try {
    await portalFetch(
      '/api/c/heartbeat',
      { method: 'POST', body: JSON.stringify(body) },
      isOk
    )
    return 'ok'
  } catch (e) {
    return e instanceof PortalError && e.status === 429
      ? 'rate_limited'
      : 'failed'
  }
}
