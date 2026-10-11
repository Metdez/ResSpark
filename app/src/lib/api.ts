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

export const isOk = (v: unknown): v is { ok: true } => isObject(v) && v.ok === true

export async function api<T>(
  _path: string,
  _init: RequestInit & { headers?: Record<string, string> },
  _guard: (v: unknown) => v is T
): Promise<T> {
  throw new Error('not_implemented')
}
