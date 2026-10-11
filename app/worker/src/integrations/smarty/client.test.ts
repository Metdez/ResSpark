import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '../provider-error'
import { mapStreetCandidate, smartyConfigured, suggest, verifyStreet } from './client'

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`../../../test/fixtures/smarty/${name}`, import.meta.url).href), 'utf8')
const ENV = { SMARTY_AUTH_ID: 'id', SMARTY_AUTH_TOKEN: 'tok' } as unknown as Env
const STREET_Y = JSON.parse(fixture('street_y.json')) as Record<string, unknown>[]
const INPUT = { street: '1600 Amphitheatre Pkwy', secondary: null, city: 'Mountain View', state: 'CA', zipcode: '94043' }

// Answers every fetch with `body`; returns the mock so tests can read the requested URL.
const respondWith = (status: number, body: string) => {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => new Response(body, { status }))
  vi.stubGlobal('fetch', fn)
  return fn
}
const sentUrl = (fn: ReturnType<typeof respondWith>) => new URL(fn.mock.calls[0][0])
const rejection = async (p: Promise<unknown>) => {
  const err = await p.catch((e: unknown) => e)
  expect(err).toBeInstanceOf(ProviderError)
  return err as ProviderError
}

afterEach(() => vi.unstubAllGlobals())

describe('smarty client', () => {
  it('cuts search to 32 characters and sends prefer_geolocation=none', async () => {
    const fn = respondWith(200, fixture('autocomplete.json'))
    await suggest(ENV, 'x'.repeat(40))
    const url = sentUrl(fn)
    expect(url.searchParams.get('search')).toBe('x'.repeat(32))
    expect(url.searchParams.get('prefer_geolocation')).toBe('none')
    expect(url.searchParams.get('max_results')).toBe('5')
    expect((fn.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe('Basic ' + btoa('id:tok'))
  })

  it('passes selected through only when given', async () => {
    const fn = respondWith(200, fixture('autocomplete.json'))
    await suggest(ENV, '1042 W Center', '1042 W Center St Apt (3) Orem UT 84057')
    await suggest(ENV, '1042 W Center')
    expect(new URL(fn.mock.calls[0][0]).searchParams.get('selected')).toBe('1042 W Center St Apt (3) Orem UT 84057')
    expect(new URL(fn.mock.calls[1][0]).searchParams.has('selected')).toBe(false)
  })

  it('returns [] when Smarty omits suggestions', async () => {
    respondWith(200, '{}')
    expect(await suggest(ENV, '9999 Nowhere')).toEqual([])
  })

  it('drops fields beyond the six (source)', async () => {
    respondWith(200, JSON.stringify({ suggestions: [{ ...JSON.parse(fixture('autocomplete.json')).suggestions[0], source: 'postal' }] }))
    const [s] = await suggest(ENV, '1600 Amph')
    expect(Object.keys(s).sort()).toEqual(['city', 'entries', 'secondary', 'state', 'street_line', 'zipcode'])
  })

  it('reads the unit list of a building', async () => {
    respondWith(200, JSON.stringify(JSON.parse(fixture('autocomplete_units.json')).units))
    expect((await suggest(ENV, '1042 W Center', 'x')).map((s) => s.secondary)).toEqual(['Apt 101', 'Apt 102', 'Apt 103'])
  })

  it('maps a full candidate', () => {
    expect(mapStreetCandidate(STREET_Y[0])).toEqual({
      line1: '1600 Amphitheatre Pkwy',
      line2: null,
      city: 'Mountain View',
      state_code: 'CA',
      zip5: '94043',
      zip4: '1351',
      county_name: 'Santa Clara',
      county_fips: '06085',
      rdi: 'Commercial',
      dpv: 'Y',
    })
  })

  it('maps blank rdi, blank dpv, and missing metadata to null', () => {
    const c = STREET_Y[0]
    expect(mapStreetCandidate({ ...c, metadata: { ...(c.metadata as object), rdi: '' } })?.rdi).toBeNull()
    expect(mapStreetCandidate({ ...c, analysis: { dpv_match_code: '' } })?.dpv).toBeNull()
    const noMeta = mapStreetCandidate({ ...c, metadata: undefined })
    expect([noMeta?.county_name, noMeta?.county_fips, noMeta?.rdi]).toEqual([null, null, null])
  })

  it('verifyStreet sends components with candidates=1 and match=invalid, and returns null for []', async () => {
    const fn = respondWith(200, fixture('street_empty.json'))
    expect(await verifyStreet(ENV, { ...INPUT, secondary: 'Apt 2' })).toBeNull()
    const q = sentUrl(fn).searchParams
    expect([q.get('street'), q.get('secondary'), q.get('city'), q.get('state'), q.get('zipcode')]).toEqual([
      '1600 Amphitheatre Pkwy',
      'Apt 2',
      'Mountain View',
      'CA',
      '94043',
    ])
    expect([q.get('candidates'), q.get('match')]).toEqual(['1', 'invalid'])
  })

  it('maps a 401 to a permanent http_401', async () => {
    respondWith(401, '')
    const err = await rejection(verifyStreet(ENV, INPUT))
    expect([err.provider, err.code, err.status, err.transient]).toEqual(['smarty', 'http_401', 401, false])
  })

  it('maps a 503 to a transient error', async () => {
    respondWith(503, '')
    expect((await rejection(suggest(ENV, '1600 Amph'))).transient).toBe(true)
  })

  it('maps a thrown fetch to a transient network error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))))
    const err = await rejection(suggest(ENV, '1600 Amph'))
    expect([err.code, err.transient]).toEqual(['network', true])
  })

  it('smartyConfigured is false when either secret is empty', () => {
    expect(smartyConfigured(ENV)).toBe(true)
    expect(smartyConfigured({ ...ENV, SMARTY_AUTH_TOKEN: '' } as Env)).toBe(false)
    expect(smartyConfigured({ ...ENV, SMARTY_AUTH_ID: '' } as Env)).toBe(false)
  })
})
