import { afterEach, describe, expect, it, vi } from 'vitest'
import { PortalError } from '../portal-api'
import { isStartResponse, startSigning } from './sign-api'

function reply(status: number, body: unknown) {
  const fetchMock = vi.fn(async (_path: string, _init: RequestInit) => ({
    ok: status < 300,
    status,
    json: async () => body,
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

describe('startSigning', () => {
  it('POSTs the item start route with the client header', async () => {
    const m = reply(200, { connection_id: 'C1', embed_src: 'https://docuseal.com/s/abc' })
    await startSigning('I1')
    const [path, init] = m.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }]
    expect(path).toBe('/api/c/items/I1/signature/start')
    expect(init.method).toBe('POST')
    expect(init.headers['X-Requested-With']).toBe('ResSpark')
  })

  it('maps an embed_src to an embed result', async () => {
    reply(200, { connection_id: 'C1', embed_src: 'https://docuseal.com/s/abc' })
    expect(await startSigning('I1')).toEqual({
      kind: 'embed',
      connectionId: 'C1',
      embedSrc: 'https://docuseal.com/s/abc',
    })
  })

  it('maps signed: true to a signed result', async () => {
    reply(200, { connection_id: 'C1', signed: true })
    expect(await startSigning('I1')).toEqual({ kind: 'signed', connectionId: 'C1' })
  })

  it.each(['https://evil.example/s/abc', 'http://docuseal.com/s/abc', 'https://docuseal.com.evil.example/s/x'])(
    'rejects an embed_src outside https://docuseal.com/s/ (%s)',
    async (embed_src) => {
      reply(200, { connection_id: 'C1', embed_src })
      await expect(startSigning('I1')).rejects.toMatchObject({ status: 500, code: 'invalid_response' })
    }
  )

  it('turns a 409 envelope into PortalError(409, consent_required)', async () => {
    reply(409, { error: { code: 'consent_required', message: 'x' } })
    const e = await startSigning('I1').catch((x: unknown) => x)
    expect(e).toBeInstanceOf(PortalError)
    expect(e).toMatchObject({ status: 409, code: 'consent_required' })
  })

  it('guards the response shape', () => {
    expect(isStartResponse({ connection_id: 'C1', embed_src: 'x' })).toBe(true)
    expect(isStartResponse({ connection_id: 'C1', signed: true })).toBe(true)
    expect(isStartResponse({ connection_id: 'C1' })).toBe(false)
    expect(isStartResponse({ embed_src: 'x' })).toBe(false)
    expect(isStartResponse(null)).toBe(false)
  })
})
