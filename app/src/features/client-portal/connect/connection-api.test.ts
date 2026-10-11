import { afterEach, describe, expect, it, vi } from 'vitest'
import { CONSENT_TEXT } from '@/lib/consent-text'
import { PortalError } from '../portal-api'
import {
  attributeStatement,
  getItemConnection,
  reconcileConnection,
  recordConsent,
  startConnection,
} from './connection-api'

const VIEW = {
  provider: { id: 'truv', configured: true, capabilities: null },
  consented: false,
  connection: null,
}

function stub(status: number, body: unknown) {
  const f = vi.fn(async () => ({ ok: status < 300, status, json: async () => body }))
  vi.stubGlobal('fetch', f)
  return f
}
const call = (f: ReturnType<typeof stub>) => f.mock.calls[0] as unknown as [string, RequestInit]
const header = (init: RequestInit) => (init.headers as Record<string, string>)['X-Requested-With']

afterEach(() => vi.unstubAllGlobals())

describe('connection-api', () => {
  it('getItemConnection GETs the item connection with the cookie', async () => {
    const f = stub(200, VIEW)
    await expect(getItemConnection('I1')).resolves.toEqual(VIEW)
    const [path, init] = call(f)
    expect(path).toBe('/api/c/items/I1/connection')
    expect(init.credentials).toBe('same-origin')
  })

  it('rejects a body that is not an ItemConnection', async () => {
    stub(200, { provider: {}, consented: 'no' })
    await expect(getItemConnection('I1')).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('recordConsent posts the kind and the current text version with the header', async () => {
    const f = stub(200, { consented: true })
    await recordConsent('payroll_data')
    const [path, init] = call(f)
    expect(path).toBe('/api/c/consents')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({
      kind: 'payroll_data',
      text_version: CONSENT_TEXT.payroll_data.version,
    })
    expect(header(init)).toBe('ResSpark')
  })

  it('startConnection posts the item id to the kind start route', async () => {
    const f = stub(200, { connection_id: 'C1', bridge_token: 'bt_1' })
    await expect(startConnection('payroll', 'I1')).resolves.toMatchObject({ connection_id: 'C1' })
    const [path, init] = call(f)
    expect(path).toBe('/api/c/connections/payroll/start')
    expect(JSON.parse(String(init.body))).toEqual({ item_id: 'I1' })
  })

  it('startConnection surfaces provider_not_configured as a PortalError', async () => {
    stub(503, { error: { code: 'provider_not_configured' } })
    const e = await startConnection('payroll', 'I1').catch((x: unknown) => x)
    expect(e).toBeInstanceOf(PortalError)
    expect(e).toMatchObject({ status: 503, code: 'provider_not_configured' })
  })

  it('reconcileConnection posts and resolves even when fetch rejects', async () => {
    const f = stub(202, undefined)
    await reconcileConnection('C1')
    expect(call(f)[0]).toBe('/api/c/connections/C1/reconcile')
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))))
    await expect(reconcileConnection('C1')).resolves.toBeUndefined()
  })

  it('attributeStatement posts the body to the manual statements route', async () => {
    const f = stub(200, { status: 'manual' })
    const body = { document_id: 'D1', bank_account_id: 'A1', year: 2026, month: 6 }
    await attributeStatement('C1', body)
    const [path, init] = call(f)
    expect(path).toBe('/api/c/connections/C1/statements/manual')
    expect(JSON.parse(String(init.body))).toEqual(body)
  })
})
