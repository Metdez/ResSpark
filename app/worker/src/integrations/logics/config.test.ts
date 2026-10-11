import { describe, expect, it, vi } from 'vitest'
import { encryptSecret } from '../credential-crypto'
import { LogicsError } from './client'
import { liveClientFromRow, resolveLogicsClient, validateLogicsBaseUrl, type IntegrationRow } from './config'

const key = '00'.repeat(32)
const BASE = 'https://valortax.logiqsapi.com/publicapi/V4/'
const env = (mode: string) => ({ LOGICS_MODE: mode, INTEGRATION_ENC_KEY: key, APP_ENV: 'sandbox' })

const row = async (last_test_ok: boolean | null): Promise<IntegrationRow> => ({
  base_url: BASE,
  api_key_ciphertext: await encryptSecret(key, 'K'),
  secret_ciphertext: await encryptSecret(key, 'S'),
  last_test_ok,
})

describe('validateLogicsBaseUrl', () => {
  it('adds a trailing slash to a valid production URL', () => {
    expect(validateLogicsBaseUrl('https://valortax.logiqsapi.com/publicapi/V4', 'production')).toBe(BASE)
    expect(validateLogicsBaseUrl(BASE, 'production')).toBe(BASE)
  })

  it('rejects http in every env', () => {
    for (const e of ['production', 'sandbox']) {
      expect(() => validateLogicsBaseUrl('http://valortax.logiqsapi.com/publicapi/V4/', e)).toThrow(
        'invalid_base_url'
      )
    }
  })

  it('pins the logiqsapi.com host in production only', () => {
    expect(() => validateLogicsBaseUrl('https://evil.example/publicapi/V4/', 'production')).toThrow(
      'invalid_base_url'
    )
    expect(() => validateLogicsBaseUrl('https://logiqsapi.com.evil.example/', 'production')).toThrow(
      'invalid_base_url'
    )
    expect(validateLogicsBaseUrl('https://evil.example/publicapi/V4/', 'sandbox')).toBe(
      'https://evil.example/publicapi/V4/'
    )
  })

  it('rejects IP literals in every env', () => {
    expect(() => validateLogicsBaseUrl('https://169.254.169.254/', 'sandbox')).toThrow('invalid_base_url')
    expect(() => validateLogicsBaseUrl('https://[::1]/', 'sandbox')).toThrow('invalid_base_url')
  })

  it('rejects a non-URL', () => {
    expect(() => validateLogicsBaseUrl('not a url', 'sandbox')).toThrow('invalid_base_url')
  })
})

describe('resolveLogicsClient', () => {
  it('fake mode with no row returns the fixture client', async () => {
    const { client, mode } = await resolveLogicsClient(env('fake'), null)
    expect(mode).toBe('fake')
    await expect(client.findByEmail('jordan.rivera@example.com')).resolves.toHaveLength(1)
  })

  it('fake mode wins even over tested credentials', async () => {
    await expect(resolveLogicsClient(env('fake'), await row(true))).resolves.toMatchObject({ mode: 'fake' })
  })

  it('live mode without a row is not_configured', async () => {
    const err = await resolveLogicsClient(env('live'), null).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(LogicsError)
    expect(err).toMatchObject({ kind: 'not_configured' })
  })

  it('live mode with untested credentials is not_configured', async () => {
    await expect(resolveLogicsClient(env('live'), await row(null))).rejects.toMatchObject({
      kind: 'not_configured',
    })
    await expect(resolveLogicsClient(env('live'), await row(false))).rejects.toMatchObject({
      kind: 'not_configured',
    })
  })

  it('live mode with a missing ciphertext is not_configured', async () => {
    const r = { ...(await row(true)), secret_ciphertext: null }
    await expect(resolveLogicsClient(env('live'), r)).rejects.toMatchObject({ kind: 'not_configured' })
  })

  it('live mode with tested credentials decrypts and builds the live client', async () => {
    const fetchStub = vi.fn().mockResolvedValue(new Response('{"Success":true,"data":[]}', { status: 200 }))
    vi.stubGlobal('fetch', fetchStub)
    try {
      const { client, mode } = await resolveLogicsClient(env('live'), await row(true))
      expect(mode).toBe('live')
      await client.findByEmail('a@example.com')
      const [url, init] = fetchStub.mock.calls[0] as [string, RequestInit]
      expect(url).toBe(BASE + 'Find/FindCaseByEmail')
      expect(new Headers(init.headers).get('authorization')).toBe('Basic ' + Buffer.from('K:S').toString('base64'))
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('liveClientFromRow', () => {
  it('builds a live client from untested credentials (Test connection)', async () => {
    const client = await liveClientFromRow(env('fake'), await row(null))
    expect(typeof client.caseInfo).toBe('function')
  })

  it('re-validates the stored base URL before building the client', async () => {
    const r = { ...(await row(true)), base_url: 'https://evil.example/' }
    await expect(liveClientFromRow({ ...env('live'), APP_ENV: 'production' }, r)).rejects.toThrow(
      'invalid_base_url'
    )
  })

  it('throws not_configured when a ciphertext is missing', async () => {
    const r = { ...(await row(null)), api_key_ciphertext: null }
    await expect(liveClientFromRow(env('live'), r)).rejects.toMatchObject({ kind: 'not_configured' })
  })
})
