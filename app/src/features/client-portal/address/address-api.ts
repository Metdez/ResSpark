import { portalFetch } from '../portal-api'

// Contracts of app/worker/src/routes/c-address.ts (Plan 06-01), mirrored, not imported.
export interface AddressSuggestion {
  street_line: string
  secondary: string
  city: string
  state: string
  zipcode: string
  entries: number
}

export type ConfirmBody =
  | { source: 'smarty'; street_line: string; secondary?: string; city: string; state: string; zipcode: string }
  | { source: 'manual'; street: string; unit?: string; city: string; state: string; zip5: string }

export interface ConfirmResult {
  address: {
    line1: string
    line2: string | null
    city: string | null
    state_code: string | null
    zip5: string | null
    zip4: string | null
  }
  verified: boolean
  dpv: string | null
  needs_unit: boolean
  item_status: string
  request_status: string
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown) => typeof v === 'string'
const strOrNull = (v: unknown) => v === null || typeof v === 'string'

const isSuggestion = (v: unknown): v is AddressSuggestion =>
  isObject(v) &&
  str(v.street_line) &&
  str(v.secondary) &&
  str(v.city) &&
  str(v.state) &&
  str(v.zipcode) &&
  typeof v.entries === 'number'

export const isSuggestResponse = (v: unknown): v is { suggestions: AddressSuggestion[] } =>
  isObject(v) && Array.isArray(v.suggestions) && v.suggestions.every(isSuggestion)

export const isConfirmResult = (v: unknown): v is ConfirmResult =>
  isObject(v) &&
  isObject(v.address) &&
  str(v.address.line1) &&
  strOrNull(v.address.line2) &&
  strOrNull(v.address.city) &&
  strOrNull(v.address.state_code) &&
  strOrNull(v.address.zip5) &&
  strOrNull(v.address.zip4) &&
  typeof v.verified === 'boolean' &&
  strOrNull(v.dpv) &&
  typeof v.needs_unit === 'boolean' &&
  str(v.item_status) &&
  str(v.request_status)

// Smarty's documented `selected` format for expanding a multi-unit suggestion.
export const selectedFor = (s: AddressSuggestion) =>
  `${s.street_line} ${s.secondary} (${s.entries}) ${s.city} ${s.state} ${s.zipcode}`

export async function suggestAddresses(q: string, selected?: string): Promise<AddressSuggestion[]> {
  const query = `q=${encodeURIComponent(q)}` + (selected ? `&selected=${encodeURIComponent(selected)}` : '')
  const res = await portalFetch(`/api/c/address/suggest?${query}`, {}, isSuggestResponse)
  return res.suggestions
}

export const confirmAddress = (itemId: string, body: ConfirmBody) =>
  portalFetch(
    `/api/c/items/${encodeURIComponent(itemId)}/address`,
    { method: 'POST', body: JSON.stringify(body) },
    isConfirmResult
  )
