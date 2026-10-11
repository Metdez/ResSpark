import { isTransientStatus, ProviderError } from '../../provider-error'

export const PLAID_HOSTS = { sandbox: 'https://sandbox.plaid.com', production: 'https://production.plaid.com' } as const

export const PERMANENT_ITEM_ERRORS = [
  'ITEM_LOGIN_REQUIRED',
  'INVALID_ACCESS_TOKEN',
  'ITEM_NOT_FOUND',
  'USER_PERMISSION_REVOKED',
  'USER_ACCOUNT_REVOKED',
] as const

const TRANSIENT_CODES = ['RATE_LIMIT_EXCEEDED', 'INTERNAL_SERVER_ERROR']

const hostOf = (env: Env) => PLAID_HOSTS[(env.PLAID_ENV as keyof typeof PLAID_HOSTS) ?? 'sandbox'] ?? PLAID_HOSTS.sandbox

// Bodies and headers are never logged: they carry access tokens and client financial data.
export async function plaidRaw(env: Env, path: string, body: Record<string, unknown>): Promise<Response> {
  if (!env.PLAID_CLIENT_ID || !env.PLAID_SECRET) throw new ProviderError('plaid', null, 'provider_not_configured', false)
  let res: Response
  try {
    res = await fetch(hostOf(env) + path, {
      method: 'POST',
      headers: { 'PLAID-CLIENT-ID': env.PLAID_CLIENT_ID, 'PLAID-SECRET': env.PLAID_SECRET, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ProviderError('plaid', null, 'network', true)
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error_code?: unknown } | null
    const code = typeof err?.error_code === 'string' ? err.error_code : `http_${res.status}`
    throw new ProviderError('plaid', res.status, code, isTransientStatus(res.status) || TRANSIENT_CODES.includes(code))
  }
  return res
}

export async function plaidFetch<T>(
  env: Env,
  path: string,
  body: Record<string, unknown>,
  guard?: (v: unknown) => v is T
): Promise<T> {
  const res = await plaidRaw(env, path, body)
  const json: unknown = await res.json().catch(() => null)
  if (json === null || (guard && !guard(json))) throw new ProviderError('plaid', res.status, 'bad_response', false)
  return json as T
}
