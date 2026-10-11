import { afterEach, describe, expect, it, vi } from 'vitest'
import { findClientLink } from '../db/client-links'
import { app } from '../index'
import { LOG_FIELDS } from './logger'

vi.mock('../db/client-links', () => ({ findClientLink: vi.fn(async () => null) }))

const MOCK_ENV = {
  APP_ENV: 'sandbox',
  LOGICS_WRITE_ENABLED: 'false',
  LOGICS_TEST_CASE_IDS: '',
  ASSETS: {
    fetch: async () =>
      new Response('<div id="root"></div>', {
        headers: { 'content-type': 'text/html' },
      }),
  },
} as unknown as Env

describe('logger', () => {
  afterEach(() => vi.restoreAllMocks())

  it('logs exactly one JSON line with only the allowlisted keys and never the path', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await app.request('/api/nope', {}, MOCK_ENV)

    expect(log).toHaveBeenCalledTimes(1)
    const line = String(log.mock.calls[0][0])
    const rec = JSON.parse(line)
    expect(Object.keys(rec)).toEqual([...LOG_FIELDS])
    expect(rec.status).toBe(404)
    expect(rec.method).toBe('GET')
    expect(rec.error_code).toBe('not_found')
    expect(line).not.toContain('nope')
  })

  it('logs the matched route pattern, not the concrete path', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await app.request('/api/config', {}, MOCK_ENV)

    expect(JSON.parse(String(log.mock.calls[0][0])).route).toBe('/api/config')
  })

  // PLAT-08 worst case: a failing client-link request must not leak the token or the client ip.
  it('logs /c/:token for a failing client link without the token or the ip', async () => {
    const TOKEN64 = 'Q2xpZW50TGlua1Rva2VuUHJvYmVfMDEyMzQ1Njc4OWFiY2RlZl9QTEFULTA4X3Rr'
    expect(TOKEN64).toHaveLength(64)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const env = { ...MOCK_ENV, CLIENT_LINK_HMAC_KEY: 'logger-test-secret' } as unknown as Env
    const res = await app.request(`/c/${TOKEN64}`, { headers: { 'cf-connecting-ip': '198.51.100.7' } }, env)

    expect(res.status).toBe(404)
    expect(findClientLink).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledTimes(1)
    const line = String(log.mock.calls[0][0])
    const parsed = JSON.parse(line)
    expect(parsed.route).toBe('/c/:token')
    expect(Object.keys(parsed)).toEqual([...LOG_FIELDS])
    expect(parsed.status).toBe(404)
    expect(line.includes(TOKEN64)).toBe(false)
    expect(line.includes('198.51.100.7')).toBe(false)
  })
})
