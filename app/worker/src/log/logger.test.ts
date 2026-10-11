import { afterEach, describe, expect, it, vi } from 'vitest'
import { app } from '../index'
import { LOG_FIELDS } from './logger'

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
})
