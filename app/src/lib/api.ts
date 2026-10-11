export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export interface AppConfig {
  app_env: string
  logics_write_enabled: boolean
  app_name: string
}

export const isConfig = (v: unknown): v is AppConfig =>
  isObject(v) &&
  typeof v.app_env === 'string' &&
  typeof v.logics_write_enabled === 'boolean' &&
  typeof v.app_name === 'string'

export const isOk = (v: unknown): v is { ok: true } =>
  isObject(v) && v.ok === true

// Lazy import: the deployed SPA has no VITE_SUPABASE_* yet, and supabase.ts throws at load.
// Without a client there is no session, so public routes like /api/config still work.
async function accessToken(): Promise<string | undefined> {
  try {
    const { supabase } = await import('@/lib/supabase')
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token
  } catch {
    return undefined
  }
}

export async function api<T>(
  path: string,
  init: RequestInit & { headers?: Record<string, string> },
  guard: (v: unknown) => v is T
): Promise<T> {
  const token = await accessToken()
  const res = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })
  const body: unknown = await res.json().catch(() => undefined)
  if (!res.ok) {
    const err = isObject(body) && isObject(body.error) ? body.error : undefined
    if (
      err &&
      typeof err.code === 'string' &&
      typeof err.message === 'string'
    ) {
      throw new ApiError(res.status, err.code, err.message)
    }
    throw new ApiError(res.status, 'http_error', 'Request failed')
  }
  if (!guard(body))
    throw new ApiError(500, 'invalid_response', 'Invalid response')
  return body
}
