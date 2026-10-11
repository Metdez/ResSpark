import { afterEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { api, ApiError, isConfig } from './api'

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn() } },
}))

const session = (token: string | null) =>
  vi
    .mocked(supabase.auth.getSession)
    .mockResolvedValue({
      data: { session: token ? { access_token: token } : null },
    } as never)

const response = (ok: boolean, status: number, body: unknown) =>
  vi.fn().mockResolvedValue({ ok, status, json: async () => body })

const config = {
  app_env: 'sandbox',
  logics_write_enabled: false,
  app_name: 'ResSpark',
}

describe('api', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('attaches the bearer token and JSON content type when a session exists', async () => {
    session('tok')
    const fetch = response(true, 200, config)
    vi.stubGlobal('fetch', fetch)

    await expect(api('/api/config', {}, isConfig)).resolves.toEqual(config)
    const [path, init] = fetch.mock.calls[0]
    expect(path).toBe('/api/config')
    expect(init.headers).toMatchObject({
      authorization: 'Bearer tok',
      'content-type': 'application/json',
    })
  })

  it('sends no authorization header without a session', async () => {
    session(null)
    const fetch = response(true, 200, config)
    vi.stubGlobal('fetch', fetch)

    await api('/api/config', {}, isConfig)
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty('authorization')
  })

  it('maps a non-2xx envelope to ApiError(status, code, message)', async () => {
    session(null)
    vi.stubGlobal(
      'fetch',
      response(false, 401, { error: { code: 'unauthorized', message: 'x' } })
    )

    const error = await api('/api/config', {}, isConfig).catch(
      (e: unknown) => e
    )
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 401,
      code: 'unauthorized',
      message: 'x',
    })
  })

  it('maps a non-2xx without an envelope to http_error', async () => {
    session(null)
    vi.stubGlobal('fetch', response(false, 503, 'nope'))

    await expect(api('/api/config', {}, isConfig)).rejects.toMatchObject({
      status: 503,
      code: 'http_error',
    })
  })

  it('rejects a 2xx body that fails the type guard with invalid_response', async () => {
    session(null)
    vi.stubGlobal('fetch', response(true, 200, { app_env: 1 }))

    await expect(api('/api/config', {}, isConfig)).rejects.toMatchObject({
      status: 500,
      code: 'invalid_response',
    })
  })
})
