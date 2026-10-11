import { isTransientStatus, ProviderError } from '../provider-error'

// Server-to-server only (D-03): the secret key pair rides in a Basic header, never in a URL,
// and requests, headers, and bodies are never logged (they carry the client's address).
const AUTOCOMPLETE = 'https://us-autocomplete-pro.api.smarty.com/lookup'
const STREET = 'https://us-street.api.smarty.com/street-address'

export const smartyConfigured = (env: Env) => Boolean(env.SMARTY_AUTH_ID && env.SMARTY_AUTH_TOKEN)

export interface AddressSuggestion {
  street_line: string
  secondary: string
  city: string
  state: string
  zipcode: string
  entries: number
}

export interface StreetInput {
  street: string
  secondary: string | null
  city: string
  state: string
  zipcode: string
}

export interface VerifiedAddress {
  line1: string
  line2: string | null
  city: string | null
  state_code: string | null
  zip5: string | null
  zip4: string | null
  county_name: string | null
  county_fips: string | null
  rdi: 'Residential' | 'Commercial' | null
  dpv: 'Y' | 'N' | 'S' | 'D' | null
}

async function smartyGet(env: Env, url: string, params: URLSearchParams): Promise<unknown> {
  if (!smartyConfigured(env)) throw new ProviderError('smarty', null, 'provider_not_configured', false)
  let res: Response
  try {
    res = await fetch(`${url}?${params}`, {
      headers: { Authorization: 'Basic ' + btoa(`${env.SMARTY_AUTH_ID}:${env.SMARTY_AUTH_TOKEN}`), Accept: 'application/json' },
    })
  } catch {
    throw new ProviderError('smarty', null, 'network', true)
  }
  if (!res.ok) throw new ProviderError('smarty', res.status, `http_${res.status}`, isTransientStatus(res.status))
  return res.json().catch(() => {
    throw new ProviderError('smarty', res.status, 'bad_response', false)
  })
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)

// Pitfall 7: prefer_geolocation=none (no edge-IP bias) and search capped at Smarty's 32 characters.
export async function suggest(env: Env, search: string, selected?: string): Promise<AddressSuggestion[]> {
  const q = new URLSearchParams({ search: search.slice(0, 32), max_results: '5', prefer_geolocation: 'none' })
  if (selected) q.set('selected', selected)
  const body = await smartyGet(env, AUTOCOMPLETE, q)
  if (!isObject(body)) throw new ProviderError('smarty', 200, 'bad_response', false)
  // Smarty omits `suggestions` when nothing matches.
  if (body.suggestions === undefined || body.suggestions === null) return []
  if (!Array.isArray(body.suggestions)) throw new ProviderError('smarty', 200, 'bad_response', false)
  return body.suggestions.flatMap((s: unknown) => {
    if (!isObject(s)) return []
    const { street_line, secondary, city, state, zipcode, entries } = s
    if (typeof street_line !== 'string' || typeof city !== 'string' || typeof state !== 'string') return []
    if (typeof zipcode !== 'string' || typeof entries !== 'number') return []
    return [{ street_line, secondary: typeof secondary === 'string' ? secondary : '', city, state, zipcode, entries }]
  })
}

// Component fields with match=invalid (freeform input silently falls back to strict).
export async function verifyStreet(env: Env, input: StreetInput): Promise<VerifiedAddress | null> {
  const q = new URLSearchParams({ street: input.street })
  if (input.secondary) q.set('secondary', input.secondary)
  q.set('city', input.city)
  q.set('state', input.state)
  q.set('zipcode', input.zipcode)
  q.set('candidates', '1')
  q.set('match', 'invalid')
  const body = await smartyGet(env, STREET, q)
  if (!Array.isArray(body)) throw new ProviderError('smarty', 200, 'bad_response', false)
  if (body.length === 0) return null
  const mapped = mapStreetCandidate(body[0])
  if (!mapped) throw new ProviderError('smarty', 200, 'bad_response', false)
  return mapped
}

// "Only non-blank fields will be returned": an absent or blank field is unknown (NULL).
export function mapStreetCandidate(candidate: unknown): VerifiedAddress | null {
  if (!isObject(candidate)) return null
  const line1 = str(candidate.delivery_line_1)
  if (!line1) return null
  const comp = isObject(candidate.components) ? candidate.components : {}
  const meta = isObject(candidate.metadata) ? candidate.metadata : {}
  const analysis = isObject(candidate.analysis) ? candidate.analysis : {}
  const rdi = str(meta.rdi)
  const dpv = str(analysis.dpv_match_code)
  return {
    line1,
    line2: str(candidate.delivery_line_2),
    city: str(comp.city_name),
    state_code: str(comp.state_abbreviation),
    zip5: str(comp.zipcode),
    zip4: str(comp.plus4_code),
    county_name: str(meta.county_name),
    county_fips: str(meta.county_fips),
    rdi: rdi === 'Residential' || rdi === 'Commercial' ? rdi : null,
    dpv: dpv === 'Y' || dpv === 'N' || dpv === 'S' || dpv === 'D' ? dpv : null,
  }
}
