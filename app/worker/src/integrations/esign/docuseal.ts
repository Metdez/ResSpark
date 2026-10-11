import { isTransientStatus, ProviderError } from '../provider-error'

export const docusealConfigured = (env: Env) => Boolean(env.DOCUSEAL_API_KEY)

export interface DsTemplate {
  id: number
  name: string
  fields: Array<{ name: string; type?: string; required?: boolean }>
  submitters: Array<{ name: string; uuid: string }>
}
export interface DsSubmitter {
  id: number
  submission_id: number
  slug: string
  status: string
  external_id: string | null
  embed_src: string
}
export interface DsSubmission {
  id: number
  status: string
  audit_log_url: string | null
  documents: Array<{ name: string; url: string }>
  submitters: Array<{ id: number; status: string; documents?: Array<{ name: string; url: string }> }>
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

const isTemplate = (v: unknown): v is DsTemplate =>
  isObj(v) &&
  isNum(v.id) &&
  typeof v.name === 'string' &&
  Array.isArray(v.fields) &&
  v.fields.every((f) => isObj(f) && typeof f.name === 'string') &&
  Array.isArray(v.submitters) &&
  v.submitters.every((s) => isObj(s) && typeof s.name === 'string')
// The embed URL is handed to the client's browser, so only https is accepted.
const isSubmitter = (v: unknown): v is DsSubmitter =>
  isObj(v) &&
  isNum(v.id) &&
  isNum(v.submission_id) &&
  typeof v.slug === 'string' &&
  typeof v.status === 'string' &&
  typeof v.embed_src === 'string' &&
  v.embed_src.startsWith('https://')
const isSubmitterList = (v: unknown): v is DsSubmitter[] => Array.isArray(v) && v.length > 0 && v.every(isSubmitter)
const isSubmission = (v: unknown): v is DsSubmission =>
  isObj(v) && isNum(v.id) && typeof v.status === 'string' && Array.isArray(v.submitters)
const isTemplateList = (v: unknown): v is { data: Array<{ id: number; name: string }> } =>
  isObj(v) && Array.isArray(v.data) && v.data.every((t) => isObj(t) && isNum(t.id) && typeof t.name === 'string')

// Bodies and headers are never logged: they carry client PII, the API key and signing URLs.
export async function dsFetch<T>(
  env: Env,
  path: string,
  init: { method?: 'GET' | 'POST'; body?: Record<string, unknown> } | undefined,
  guard: (v: unknown) => v is T
): Promise<T> {
  if (!docusealConfigured(env)) throw new ProviderError('docuseal', null, 'provider_not_configured', false)
  let res: Response
  try {
    res = await fetch(env.DOCUSEAL_API_URL + path, {
      method: init?.method ?? 'GET',
      headers: { 'X-Auth-Token': env.DOCUSEAL_API_KEY!, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    })
  } catch {
    throw new ProviderError('docuseal', null, 'network', true)
  }
  if (!res.ok) throw new ProviderError('docuseal', res.status, `http_${res.status}`, isTransientStatus(res.status))
  const body: unknown = await res.json().catch(() => null)
  if (!guard(body)) throw new ProviderError('docuseal', res.status, 'bad_response', false)
  return body
}

export const listTemplates = async (env: Env) =>
  (await dsFetch(env, '/templates?limit=100', undefined, isTemplateList)).data.map((t) => ({ id: t.id, name: t.name }))

export const getTemplate = (env: Env, id: number) => dsFetch(env, `/templates/${id}`, undefined, isTemplate)

// POST /submissions answers with the submitter array, not a submission object (RESEARCH contradiction 2).
export const createSubmission = (env: Env, body: Record<string, unknown>) =>
  dsFetch(env, '/submissions', { method: 'POST', body }, isSubmitterList)

export const getSubmission = (env: Env, id: number) => dsFetch(env, `/submissions/${id}`, undefined, isSubmission)

export const getSubmitter = (env: Env, id: number) => dsFetch(env, '/submitters/' + id, undefined, isSubmitter)
