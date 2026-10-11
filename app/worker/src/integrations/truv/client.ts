import { isTransientStatus, ProviderError } from '../provider-error'

// One host for every Truv environment; the Access Secret selects sandbox/dev/prod.
export const TRUV_BASE = 'https://prod.truv.com/v1'

export const truvConfigured = (env: Env) => Boolean(env.TRUV_CLIENT_ID && env.TRUV_SECRET)

// Response bodies and headers are never logged: they carry client PII and bridge tokens.
export async function truvFetch<T>(
  env: Env,
  path: string,
  init: { method?: 'GET' | 'POST' | 'PATCH'; body?: Record<string, unknown> } = {},
  guard?: (v: unknown) => v is T
): Promise<T> {
  if (!truvConfigured(env)) throw new ProviderError('truv', null, 'provider_not_configured', false)
  let res: Response
  try {
    res = await fetch(TRUV_BASE + path, {
      method: init.method ?? 'GET',
      headers: {
        'X-Access-Client-Id': env.TRUV_CLIENT_ID!,
        'X-Access-Secret': env.TRUV_SECRET!,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
  } catch {
    throw new ProviderError('truv', null, 'network', true)
  }
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const code = (body as { error?: { code?: unknown } } | null)?.error?.code
    throw new ProviderError('truv', res.status, typeof code === 'string' ? code : `http_${res.status}`, isTransientStatus(res.status))
  }
  if (guard && !guard(body)) throw new ProviderError('truv', res.status, 'bad_response', false)
  return body as T
}
