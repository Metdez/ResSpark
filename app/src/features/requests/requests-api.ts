import type {
  MutationFunctionContext,
  QueryClient,
} from '@tanstack/react-query'
import { ApiError, api, isObject, isOk } from '@/lib/api'

// Contracts of the Worker routes in Plans 03/04 (snake_case JSON, mirrored, not imported).
export type ItemKind =
  | 'bank_connect'
  | 'payroll_connect'
  | 'address'
  | 'upload'
  | 'signature'
  | 'intake'

export interface TemplateItem {
  kind: ItemKind
  label: string
  required: boolean
  config: Record<string, unknown>
}

export interface Template {
  id: string
  name: string
  items: TemplateItem[]
}

export interface CaseInfo {
  case_id: string
  logics_case_id: number | null
  first_name: string | null
  last_name: string | null
  email: string | null
  phone_e164: string | null
}

export interface RequestItem {
  id: string
  position: number
  kind: string
  label: string
  required: boolean
  status: string
  config: unknown
  rejection_note: string | null
}

export interface RequestLink {
  url: string | null
  version: number
  expires_at: string
  revoked_at: string | null
  opened_at: string | null
}

export interface RequestDetail {
  id: string
  status: string
  template_name: string
  agent_display_name: string | null
  contact_email: string | null
  contact_phone_e164: string | null
  sent_at: string | null
  opened_at: string | null
  created_at: string
  case: CaseInfo
  items: RequestItem[]
  link: RequestLink | null
}

export interface SendResult {
  url: string
  expires_at: string
  version: number
}

const str = (v: unknown) => typeof v === 'string'
const strOrNull = (v: unknown) => v === null || typeof v === 'string'

const isCaseInfo = (v: unknown): v is CaseInfo =>
  isObject(v) &&
  str(v.case_id) &&
  (v.logics_case_id === null || typeof v.logics_case_id === 'number') &&
  strOrNull(v.first_name) &&
  strOrNull(v.last_name) &&
  strOrNull(v.email) &&
  strOrNull(v.phone_e164)

const isItem = (v: unknown): v is RequestItem =>
  isObject(v) &&
  str(v.id) &&
  typeof v.position === 'number' &&
  str(v.kind) &&
  str(v.label) &&
  typeof v.required === 'boolean' &&
  str(v.status)

const isLink = (v: unknown): v is RequestLink =>
  isObject(v) &&
  strOrNull(v.url) &&
  typeof v.version === 'number' &&
  str(v.expires_at) &&
  strOrNull(v.revoked_at)

export const isRequestDetail = (v: unknown): v is RequestDetail =>
  isObject(v) &&
  str(v.id) &&
  str(v.status) &&
  str(v.template_name) &&
  isCaseInfo(v.case) &&
  Array.isArray(v.items) &&
  v.items.every(isItem) &&
  (v.link === null || isLink(v.link))

const isTemplateItem = (v: unknown): v is TemplateItem =>
  isObject(v) &&
  str(v.kind) &&
  str(v.label) &&
  typeof v.required === 'boolean' &&
  isObject(v.config)

export const isTemplates = (v: unknown): v is { templates: Template[] } =>
  isObject(v) &&
  Array.isArray(v.templates) &&
  v.templates.every(
    (t) =>
      isObject(t) &&
      str(t.id) &&
      str(t.name) &&
      Array.isArray(t.items) &&
      t.items.every(isTemplateItem)
  )

export const isSendResult = (v: unknown): v is SendResult =>
  isObject(v) &&
  str(v.url) &&
  str(v.expires_at) &&
  typeof v.version === 'number'

const isCreated = (v: unknown): v is { request_id: string } =>
  isObject(v) && str(v.request_id)

const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

export const getRequest = (id: string) =>
  api(`/api/admin/requests/${id}`, {}, isRequestDetail)

export const getTemplates = () =>
  api('/api/admin/requests/templates', {}, isTemplates)

export const getCase = (id: string) =>
  api(`/api/admin/cases/${id}`, {}, isCaseInfo)

export const createRequest = (body: {
  case_id: string
  template_id: string
  items: TemplateItem[]
}) => api('/api/admin/requests', json(body), isCreated)

export const sendRequest = (
  id: string,
  body: { email: string; phone: string; keep_flagged: boolean }
) => api(`/api/admin/requests/${id}/send`, json(body), isSendResult)

export const markCopied = (id: string) =>
  api(`/api/admin/requests/${id}/copied`, json({}), isOk)

// D-09: the email route always answers 200 with a truthful result; ok:false is not an error.
export interface EmailResult {
  ok: boolean
  id?: string
  reason?: 'not_configured' | 'send_failed' | 'no_link'
}
export const isEmailResult = (v: unknown): v is EmailResult =>
  isObject(v) && typeof v.ok === 'boolean'

export const emailLink = (id: string) =>
  api(`/api/admin/requests/${id}/email`, json({}), isEmailResult)

export const regenerateLink = (id: string) =>
  api(`/api/admin/requests/${id}/regenerate`, json({}), isSendResult)

export const revokeLink = (id: string) =>
  api(`/api/admin/requests/${id}/revoke`, json({}), isOk)

export const recordConsent = (id: string) =>
  api(`/api/admin/requests/${id}/consent`, json({ agreed: true }), isOk)

export interface RequestListRow {
  id: string
  status: string
  client_name: string
  sent_at: string | null
  expires_at: string | null
  created_at: string
}

export const isRequestList = (
  v: unknown
): v is { requests: RequestListRow[] } =>
  isObject(v) &&
  Array.isArray(v.requests) &&
  v.requests.every(
    (r) =>
      isObject(r) &&
      str(r.id) &&
      str(r.status) &&
      str(r.client_name) &&
      strOrNull(r.sent_at) &&
      strOrNull(r.expires_at) &&
      str(r.created_at)
  )

export function listRequests() {
  return api('/api/admin/requests', {}, isRequestList)
}

export interface SendErrorExtras {
  email_error?: string
  phone_error?: string
  email_suggestion?: string
  differs?: ('email' | 'phone')[]
  changed?: string[]
}

// The 400/409 send refusals carry extra fields beside the error envelope (Plan 04).
export function sendErrorExtras(err: ApiError): SendErrorExtras {
  const b = err.body
  if (!isObject(b)) return {}
  const out: SendErrorExtras = {}
  if (typeof b.email_error === 'string') out.email_error = b.email_error
  if (typeof b.phone_error === 'string') out.phone_error = b.phone_error
  if (typeof b.email_suggestion === 'string')
    out.email_suggestion = b.email_suggestion
  if (Array.isArray(b.differs))
    out.differs = b.differs.filter(
      (d): d is 'email' | 'phone' => d === 'email' || d === 'phone'
    )
  if (Array.isArray(b.changed))
    out.changed = b.changed.filter((c): c is string => typeof c === 'string')
  return out
}

// The Logics two-part copy lives with the lookup screen; re-exported for the send screen.
export { logicsErrorCopy } from '@/features/lookup/lookup-api'

// A mutation onError: codes the screen renders itself skip the app-wide handler; anything else
// (401 sign-out, 403, generic toast) still reaches it, so one failure never shows twice.
export const unlessHandled =
  (qc: QueryClient, handled: (e: ApiError) => boolean) =>
  (
    error: Error,
    variables: unknown,
    result: unknown,
    context: MutationFunctionContext
  ) => {
    if (error instanceof ApiError && handled(error)) return
    qc.getDefaultOptions().mutations?.onError?.(
      error,
      variables,
      result,
      context
    )
  }

// UI-SPEC date format (`Oct 24, 2026`) in the viewer's time zone; callers put the raw value in `title`.
const DATE = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})
export const formatDate = (iso: string) => DATE.format(new Date(iso))
