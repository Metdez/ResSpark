import { describe, expect, it, vi } from 'vitest'
import { createLogicsClient, LogicsError } from './client'

const BASE = 'https://x.logiqsapi.com/publicapi/V4/'
const AUTH = 'Basic ' + Buffer.from('K:S').toString('base64')
const row = { CaseID: 344624, FirstName: 'Steve' }

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
const status = (code: number) => new Response('{"message":"secret body 1211212121"}', { status: code })

const setup = (...results: Array<Response | Error>) => {
  const fetchStub = vi.fn()
  for (const r of results) {
    if (r instanceof Error) fetchStub.mockRejectedValueOnce(r)
    else fetchStub.mockResolvedValueOnce(r)
  }
  const client = createLogicsClient({ baseUrl: BASE, apiKey: 'K', secretToken: 'S' }, fetchStub)
  return { client, fetchStub }
}

const headersOf = (fetchStub: ReturnType<typeof vi.fn>, call = 0) =>
  new Headers((fetchStub.mock.calls[call][1] as RequestInit).headers)

describe('createLogicsClient', () => {
  it('findByPhone sends GET with Basic auth and a phone header, no query string', async () => {
    const { client, fetchStub } = setup(ok({ Success: true, data: [row] }))
    await expect(client.findByPhone('1211212121')).resolves.toEqual([row])
    expect(fetchStub).toHaveBeenCalledTimes(1)
    const [url, init] = fetchStub.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(BASE + 'Find/FindCaseByPhone')
    expect(url).not.toContain('?')
    expect(init.method).toBe('GET')
    const h = headersOf(fetchStub)
    expect(h.get('authorization')).toBe(AUTH)
    expect(h.get('phone')).toBe('1211212121')
  })

  it('findByEmail calls Find/FindCaseByEmail with an email header', async () => {
    const { client, fetchStub } = setup(ok({ Success: true, data: [row] }))
    await client.findByEmail('a@example.com')
    expect(fetchStub.mock.calls[0][0]).toBe(BASE + 'Find/FindCaseByEmail')
    expect(headersOf(fetchStub).get('email')).toBe('a@example.com')
  })

  it('findByLastNameAndPhone calls Find/FindCase with lastName and phone headers', async () => {
    const { client, fetchStub } = setup(ok({ Success: true, data: [row] }))
    await client.findByLastNameAndPhone('Joe', '1211212121')
    expect(fetchStub.mock.calls[0][0]).toBe(BASE + 'Find/FindCase')
    const h = headersOf(fetchStub)
    expect(h.get('lastName')).toBe('Joe')
    expect(h.get('phone')).toBe('1211212121')
  })

  it('caseInfo calls Case/CaseInfo with a CaseID header and returns the data object', async () => {
    const { client, fetchStub } = setup(ok({ Success: true, data: row }))
    await expect(client.caseInfo(344624)).resolves.toEqual(row)
    expect(fetchStub.mock.calls[0][0]).toBe(BASE + 'Case/CaseInfo')
    expect(headersOf(fetchStub).get('CaseID')).toBe('344624')
  })

  it('Find returns [] when data is null or Success is false', async () => {
    const { client } = setup(ok({ Success: true, data: null }), ok({ Success: false, data: [row] }))
    await expect(client.findByPhone('1211212121')).resolves.toEqual([])
    await expect(client.findByPhone('1211212121')).resolves.toEqual([])
  })

  it('caseInfo returns null when data is null or Success is false', async () => {
    const { client } = setup(ok({ Success: true, data: null }), ok({ Success: false, data: row }))
    await expect(client.caseInfo(1)).resolves.toBeNull()
    await expect(client.caseInfo(1)).resolves.toBeNull()
  })

  it('401 rejects unauthorized and is not retried', async () => {
    const { client, fetchStub } = setup(status(401), status(401))
    const err = await client.findByPhone('1211212121').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(LogicsError)
    expect(err).toMatchObject({ kind: 'unauthorized', status: 401 })
    expect(fetchStub).toHaveBeenCalledTimes(1)
  })

  it('403 rejects forbidden', async () => {
    const { client, fetchStub } = setup(status(403))
    await expect(client.findByEmail('a@example.com')).rejects.toMatchObject({
      kind: 'forbidden',
      status: 403,
    })
    expect(fetchStub).toHaveBeenCalledTimes(1)
  })

  it('500 rejects upstream and is not retried', async () => {
    const { client, fetchStub } = setup(status(500), status(500))
    await expect(client.caseInfo(1)).rejects.toMatchObject({ kind: 'upstream', status: 500 })
    expect(fetchStub).toHaveBeenCalledTimes(1)
  })

  it('retries a network failure exactly once and resolves', async () => {
    const { client, fetchStub } = setup(new TypeError('fetch failed'), ok({ Success: true, data: [row] }))
    await expect(client.findByPhone('1211212121')).resolves.toEqual([row])
    expect(fetchStub).toHaveBeenCalledTimes(2)
  })

  it('two network failures reject network after exactly two calls', async () => {
    const { client, fetchStub } = setup(new TypeError('fetch failed'), new TypeError('fetch failed'))
    await expect(client.findByPhone('1211212121')).rejects.toMatchObject({ kind: 'network' })
    expect(fetchStub).toHaveBeenCalledTimes(2)
  })

  it('invalid JSON rejects invalid_response', async () => {
    const { client } = setup(new Response('<html>', { status: 200 }))
    await expect(client.findByPhone('1211212121')).rejects.toMatchObject({ kind: 'invalid_response' })
  })

  it('error messages never carry credentials, the search value, or the host', async () => {
    const { client } = setup(status(401), new TypeError('fetch failed https://x.logiqsapi.com'), new TypeError('x'))
    const errs = [
      await client.findByPhone('1211212121').catch((e: Error) => e),
      await client.findByPhone('1211212121').catch((e: Error) => e),
    ]
    for (const e of errs) {
      for (const leak of ['K', 'S', '1211212121', 'logiqsapi']) expect(e.message).not.toContain(leak)
    }
  })

  it('passes an AbortSignal to fetch', async () => {
    const { client, fetchStub } = setup(ok({ Success: true, data: [] }))
    await client.findByPhone('1211212121')
    expect((fetchStub.mock.calls[0][1] as RequestInit).signal).toBeInstanceOf(AbortSignal)
  })
})
