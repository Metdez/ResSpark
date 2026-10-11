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
  // Logics reads GET parameters from the query string only (the documented headers are ignored).
  it('findByPhone sends GET with Basic auth and the phone on the query string', async () => {
    const { client, fetchStub } = setup(ok({ Success: true, data: [row] }))
    await expect(client.findByPhone('1211212121')).resolves.toEqual([row])
    expect(fetchStub).toHaveBeenCalledTimes(1)
    const [url, init] = fetchStub.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(BASE + 'Find/FindCaseByPhone?phone=1211212121')
    expect(init.method).toBe('GET')
    const h = headersOf(fetchStub)
    expect(h.get('authorization')).toBe(AUTH)
    expect(h.get('phone')).toBeNull()
  })

  it('findByEmail calls Find/FindCaseByEmail with the email URL-encoded', async () => {
    const { client, fetchStub } = setup(ok({ Success: true, data: [row] }))
    await client.findByEmail('a+b@example.com')
    expect(fetchStub.mock.calls[0][0]).toBe(BASE + 'Find/FindCaseByEmail?email=a%2Bb%40example.com')
  })

  it('findByLastNameAndPhone calls Find/FindCase with lastName and phone', async () => {
    const { client, fetchStub } = setup(ok({ Success: true, data: [row] }))
    await client.findByLastNameAndPhone('Joe', '1211212121')
    expect(fetchStub.mock.calls[0][0]).toBe(BASE + 'Find/FindCase?lastName=Joe&phone=1211212121')
  })

  it('caseInfo calls Case/CaseInfo with CaseID and returns the data object', async () => {
    const { client, fetchStub } = setup(ok({ Success: true, data: row }))
    await expect(client.caseInfo(344624)).resolves.toEqual(row)
    expect(fetchStub.mock.calls[0][0]).toBe(BASE + 'Case/CaseInfo?CaseID=344624')
  })

  it('reads the capitalized live envelope (Data, Success) for Find and CaseInfo', async () => {
    const { client } = setup(ok({ Data: [row], Success: true, Message: 'Data retrieved successfully.' }), ok({ Data: row, Success: true }))
    await expect(client.findByEmail('a@example.com')).resolves.toEqual([row])
    await expect(client.caseInfo(344624)).resolves.toEqual(row)
  })

  it('treats a Find 404 ("Resource not found!") as no match, not an outage', async () => {
    const { client } = setup(new Response('{"Data":null,"Success":false,"Message":"Resource not found!"}', { status: 404 }))
    await expect(client.findByEmail('nobody@example.com')).resolves.toEqual([])
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

  it('caseInfo treats a 404 as no case', async () => {
    const { client } = setup(status(404))
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
      await client.findByPhone('1211212121').then(() => null, (e: Error) => e),
      await client.findByPhone('1211212121').then(() => null, (e: Error) => e),
    ]
    for (const e of errs) {
      expect(e).toBeInstanceOf(LogicsError)
      for (const leak of ['K', 'S', '1211212121', 'logiqsapi']) expect(e?.message).not.toContain(leak)
    }
  })

  it('passes an AbortSignal to fetch', async () => {
    const { client, fetchStub } = setup(ok({ Success: true, data: [] }))
    await client.findByPhone('1211212121')
    expect((fetchStub.mock.calls[0][1] as RequestInit).signal).toBeInstanceOf(AbortSignal)
  })
})
