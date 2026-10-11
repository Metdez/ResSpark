import { afterEach, describe, expect, it, vi } from 'vitest'
import { PortalError } from '../portal-api'
import { confirmAddress, selectedFor, suggestAddresses } from './address-api'

const S = { street_line: '1600 Amphitheatre Pkwy', secondary: '', city: 'Mountain View', state: 'CA', zipcode: '94043', entries: 0 }
const RESULT = {
  address: { line1: '1600 Amphitheatre Pkwy', line2: null, city: 'Mountain View', state_code: 'CA', zip5: '94043', zip4: '1351' },
  verified: true,
  dpv: 'Y',
  needs_unit: false,
  item_status: 'submitted',
  request_status: 'waiting_on_staff',
}

const stub = (status: number, body: unknown) => {
  const f = vi.fn(async () => ({ ok: status < 300, status, json: async () => body }))
  vi.stubGlobal('fetch', f)
  return f
}
const call = (f: ReturnType<typeof stub>) => f.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }]

afterEach(() => vi.unstubAllGlobals())

describe('address-api', () => {
  it('suggestAddresses GETs the encoded query with the ResSpark header', async () => {
    const f = stub(200, { suggestions: [S] })
    expect(await suggestAddresses('1600 Amph')).toEqual([S])
    const [path, init] = call(f)
    expect(path).toBe('/api/c/address/suggest?q=1600%20Amph')
    expect(init.headers['X-Requested-With']).toBe('ResSpark')
  })

  it('adds an encoded selected parameter', async () => {
    const f = stub(200, { suggestions: [] })
    await suggestAddresses('1042 W', 'A B (3)')
    expect(call(f)[0]).toBe('/api/c/address/suggest?q=1042%20W&selected=A%20B%20(3)')
  })

  it('a body without suggestions is PortalError(500, invalid_response)', async () => {
    stub(200, { nope: true })
    const err = await suggestAddresses('1600').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(PortalError)
    expect(err).toMatchObject({ status: 500, code: 'invalid_response' })
  })

  it('selectedFor builds the Smarty selected format', () => {
    expect(
      selectedFor({ street_line: '1042 W Center St', secondary: 'Apt', entries: 3, city: 'Orem', state: 'UT', zipcode: '84057' })
    ).toBe('1042 W Center St Apt (3) Orem UT 84057')
  })

  it('confirmAddress POSTs the JSON body and returns the guarded result', async () => {
    const f = stub(200, RESULT)
    const body = { source: 'smarty' as const, street_line: S.street_line, city: S.city, state: S.state, zipcode: S.zipcode }
    expect(await confirmAddress('I1', body)).toEqual(RESULT)
    const [path, init] = call(f)
    expect(path).toBe('/api/c/items/I1/address')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual(body)
  })

  it('a malformed confirm result is rejected', async () => {
    stub(200, { ...RESULT, needs_unit: 'no' })
    await expect(confirmAddress('I1', { source: 'manual', street: 'a', city: 'b', state: 'IL', zip5: '62701' })).rejects.toThrow(
      'invalid_response'
    )
  })
})
