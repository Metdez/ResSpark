import { api, isObject } from '@/lib/api'
import { normalizePhone } from '@/lib/contact'

// Contracts of POST /api/admin/lookup and POST /api/admin/cases/:id/confirm (Plan 02-03).
export type LookupType = 'case_id' | 'phone' | 'email'
export type MatchedField =
  | 'cell'
  | 'home'
  | 'work'
  | 'email'
  | 'case_id'
  | 'last_name_phone'

export interface LogicsCaseSummary {
  logics_case_id: number
  first_name: string | null
  last_name: string | null
  status_id: number | null
  created_date: string | null
  cell_phone: string | null
  home_phone: string | null
  work_phone: string | null
  email: string | null
  city: string | null
  state: string | null
  zip: string | null
  language: string | null
  matched_field: MatchedField | null
}

export interface LookupResponse {
  results: LogicsCaseSummary[]
  mode: 'fake' | 'live'
}

export interface ConfirmResponse {
  case_id: string
  logics_case_id: number
  first_name: string | null
  last_name: string | null
  email: string | null
  phone_e164: string | null
}

const CASE_ID = /^\d{1,9}$/

// Mirror of detectLookupType in worker/src/integrations/logics/lookup.ts; the Worker still validates.
export function detectLookupType(raw: string): LookupType | null {
  const v = raw.trim()
  if (v === '') return null
  if (v.includes('@')) return 'email'
  const stripped = v.replace(/[()+\-. ]/g, '')
  if (!/^\d+$/.test(stripped)) return null
  if (CASE_ID.test(stripped)) return 'case_id'
  return normalizePhone(stripped) ? 'phone' : null
}

const strOrNull = (v: unknown) => v === null || typeof v === 'string'
const numOrNull = (v: unknown) => v === null || typeof v === 'number'
const TEXT_FIELDS = [
  'first_name',
  'last_name',
  'created_date',
  'cell_phone',
  'home_phone',
  'work_phone',
  'email',
  'city',
  'state',
] as const

const isSummary = (v: unknown): v is LogicsCaseSummary =>
  isObject(v) &&
  typeof v.logics_case_id === 'number' &&
  numOrNull(v.status_id) &&
  TEXT_FIELDS.every((k) => strOrNull(v[k])) &&
  strOrNull(v.matched_field)

export const isLookupResponse = (v: unknown): v is LookupResponse =>
  isObject(v) &&
  (v.mode === 'fake' || v.mode === 'live') &&
  Array.isArray(v.results) &&
  v.results.every(isSummary)

export const isConfirmResponse = (v: unknown): v is ConfirmResponse =>
  isObject(v) &&
  typeof v.case_id === 'string' &&
  typeof v.logics_case_id === 'number' &&
  strOrNull(v.first_name) &&
  strOrNull(v.last_name) &&
  strOrNull(v.email) &&
  strOrNull(v.phone_e164)

const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

export const lookup = (input: {
  type: LookupType
  value: string
  last_name?: string
}) => api('/api/admin/lookup', json(input), isLookupResponse)

export const confirmCase = (logicsCaseId: number, searchType: LookupType) =>
  api(
    `/api/admin/cases/${logicsCaseId}/confirm`,
    json({ search_type: searchType }),
    isConfirmResponse
  )

// Two-part copy for the Logics failures; the single source for the lookup and send screens.
const LOGICS_COPY = new Map<string, { title: string; body: string }>([
  [
    'logics_not_configured',
    {
      title: 'Logics is not configured',
      body: 'Ask your admin to enter the Logics API key and secret token in Settings → Integrations and run Test connection.',
    },
  ],
  [
    'logics_unreachable',
    {
      title: "Couldn't reach Logics",
      body: 'Try again in a moment. If it keeps failing, ask your admin to check Settings → Integrations.',
    },
  ],
  [
    'logics_unauthorized',
    {
      title: 'Logics rejected the credentials',
      body: 'Ask your admin to re-enter the API key and secret token in Settings → Integrations.',
    },
  ],
])

export const logicsErrorCopy = (code: string) => LOGICS_COPY.get(code)
