import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../src/index'

const fakeAssets = vi.fn(
  async () =>
    new Response('<div id="root"></div>', {
      headers: { 'content-type': 'text/html' },
    })
)
const MOCK_ENV = {
  APP_ENV: 'sandbox',
  LOGICS_WRITE_ENABLED: 'false',
  LOGICS_TEST_CASE_IDS: '',
  ASSETS: { fetch: fakeAssets },
} as unknown as Env

describe('worker routing', () => {
  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => {}))
  afterEach(() => vi.restoreAllMocks())

  it('GET /api/config returns the display flags', async () => {
    const res = await app.request('/api/config', {}, MOCK_ENV)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      app_env: 'sandbox',
      logics_write_enabled: false,
      logics_mode: 'fake',
      app_name: 'ResSpark',
    })
  })

  it('GET /webhooks/x returns the 404 envelope, not index.html', async () => {
    const res = await app.request('/webhooks/x', {}, MOCK_ENV)
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('not_found')
  })

  it('GET /c/ falls back to the SPA with no-store, noindex, no-referrer headers', async () => {
    const res = await app.request('/c/', {}, MOCK_ENV)
    expect(fakeAssets).toHaveBeenCalled()
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex')
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer')
  })
})
