import { api, isObject } from '@/lib/api'

// Contracts of the Worker's /api/admin/integrations/logics routes (Plan 02-03), mirrored here.
export interface IntegrationStatus {
  configured: boolean
  base_url: string
  key_hint: string | null
  last_test_at: string | null
  last_test_ok: boolean | null
  updated_at: string | null
  mode: 'fake' | 'live'
}

export interface TestResult {
  ok: boolean
  status: number | null
  tested_at: string
}

const strOrNull = (v: unknown) => v === null || typeof v === 'string'

export const isIntegrationStatus = (v: unknown): v is IntegrationStatus =>
  isObject(v) &&
  typeof v.configured === 'boolean' &&
  typeof v.base_url === 'string' &&
  strOrNull(v.key_hint) &&
  strOrNull(v.last_test_at) &&
  (v.last_test_ok === null || typeof v.last_test_ok === 'boolean') &&
  strOrNull(v.updated_at) &&
  (v.mode === 'fake' || v.mode === 'live')

export const isTestResult = (v: unknown): v is TestResult =>
  isObject(v) &&
  typeof v.ok === 'boolean' &&
  (v.status === null || typeof v.status === 'number') &&
  typeof v.tested_at === 'string'

const PATH = '/api/admin/integrations/logics'

export const getLogicsStatus = () => api(PATH, {}, isIntegrationStatus)

export function saveLogicsCredentials(v: {
  api_key: string
  secret_token: string
  base_url?: string
}) {
  const base_url = v.base_url?.trim()
  const body = {
    api_key: v.api_key,
    secret_token: v.secret_token,
    // Blank means the ValorTax default, which the Worker applies when the key is absent.
    ...(base_url ? { base_url } : {}),
  }
  return api(
    PATH,
    { method: 'PUT', body: JSON.stringify(body) },
    isIntegrationStatus
  )
}

export const testLogicsConnection = () =>
  api(`${PATH}/test`, { method: 'POST', body: '{}' }, isTestResult)
