import { decryptSecret } from '../credential-crypto'
import { createLogicsClient, LogicsError, type LogicsClient } from './client'
import { createFakeLogicsClient } from './fixtures'

export const DEFAULT_LOGICS_BASE_URL = 'https://valortax.logiqsapi.com/publicapi/V4/'

export type LogicsEnv = Pick<Env, 'LOGICS_MODE' | 'INTEGRATION_ENC_KEY' | 'APP_ENV'>

export interface IntegrationRow {
  base_url: string
  api_key_ciphertext: string | null
  secret_ciphertext: string | null
  last_test_ok: boolean | null
}

export type LogicsMode = 'fake' | 'live'

// SSRF guard for the admin-editable base URL (T-02-07): https only, no IP literals, and the
// logiqsapi.com host pinned in production. Returns the URL with exactly one trailing '/'.
export function validateLogicsBaseUrl(url: string, appEnv: string): string {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    throw new Error('invalid_base_url')
  }
  const host = u.hostname
  const ipLiteral = host.includes(':') || host.startsWith('[') || /^[\d.]+$/.test(host)
  const pinned = host === 'logiqsapi.com' || host.endsWith('.logiqsapi.com')
  if (u.protocol !== 'https:' || ipLiteral || u.search || u.hash || (appEnv === 'production' && !pinned)) {
    throw new Error('invalid_base_url')
  }
  return u.href.replace(/\/*$/, '/')
}

// Used directly by "Test connection", before last_test_ok exists.
export async function liveClientFromRow(
  env: Pick<LogicsEnv, 'INTEGRATION_ENC_KEY' | 'APP_ENV'>,
  row: IntegrationRow
): Promise<LogicsClient> {
  if (!row.api_key_ciphertext || !row.secret_ciphertext) throw new LogicsError('not_configured')
  const baseUrl = validateLogicsBaseUrl(row.base_url, env.APP_ENV)
  let apiKey: string, secretToken: string
  try {
    ;[apiKey, secretToken] = await Promise.all([
      decryptSecret(env.INTEGRATION_ENC_KEY, row.api_key_ciphertext),
      decryptSecret(env.INTEGRATION_ENC_KEY, row.secret_ciphertext),
    ])
  } catch {
    // A rotated key or corrupted row: the firm must re-enter credentials.
    throw new LogicsError('not_configured')
  }
  return createLogicsClient({ baseUrl, apiKey, secretToken })
}

// Fixtures always win in fake mode, so a demo can never read the real tenant (C1). `live` is the
// switch the firm flips after Test connection succeeds (USER ACTION, Plan 03).
export async function resolveLogicsClient(
  env: LogicsEnv,
  row: IntegrationRow | null
): Promise<{ client: LogicsClient; mode: LogicsMode }> {
  if (env.LOGICS_MODE === 'fake') return { client: createFakeLogicsClient(), mode: 'fake' }
  if (!row || row.last_test_ok !== true || !row.api_key_ciphertext || !row.secret_ciphertext) {
    throw new LogicsError('not_configured')
  }
  return { client: await liveClientFromRow(env, row), mode: 'live' }
}
