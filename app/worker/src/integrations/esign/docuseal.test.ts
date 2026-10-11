import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '../provider-error'
import { createSubmission, getSubmitter, getTemplate, listTemplates } from './docuseal'

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../../test/fixtures/docuseal/${name}`, import.meta.url).href), 'utf8')
const ENV = { DOCUSEAL_API_KEY: 'k1', DOCUSEAL_API_URL: 'https://api.docuseal.com' } as unknown as Env

const respond = (status: number, body: string) => {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => new Response(body, { status, headers: { 'content-type': 'application/json' } }))
  vi.stubGlobal('fetch', fn)
  return fn
}
const providerError = async (p: Promise<unknown>) => {
  const e = await p.catch((x: unknown) => x)
  expect(e).toBeInstanceOf(ProviderError)
  return e as ProviderError
}

afterEach(() => vi.unstubAllGlobals())

describe('docuseal client', () => {
  it('sends the auth token to the configured host', async () => {
    const fn = respond(200, fixture('template.json'))
    const tpl = await getTemplate(ENV, 1001)
    expect(tpl.submitters[0].name).toBe('Client')
    const [url, init] = fn.mock.calls[0]
    expect(url).toBe('https://api.docuseal.com/templates/1001')
    expect(new Headers(init!.headers).get('x-auth-token')).toBe('k1')
  })

  it('createSubmission resolves the submitter array', async () => {
    const fn = respond(200, fixture('submission_create.json'))
    const [s] = await createSubmission(ENV, { template_id: 1001 })
    expect(s).toMatchObject({ id: 5001, submission_id: 4001, slug: 'fixtureSlug1' })
    expect(fn.mock.calls[0][1]!.method).toBe('POST')
  })

  it('a non-array 200 body is bad_response, not transient', async () => {
    respond(200, fixture('submitter_pending.json'))
    const e = await providerError(createSubmission(ENV, {}))
    expect([e.code, e.transient]).toEqual(['bad_response', false])
  })

  it('422 is http_422, not transient', async () => {
    respond(422, '{"error":"bad"}')
    const e = await providerError(getTemplate(ENV, 1))
    expect([e.code, e.transient]).toEqual(['http_422', false])
  })

  it('503 is transient', async () => {
    respond(503, '')
    expect((await providerError(getSubmitter(ENV, 1))).transient).toBe(true)
  })

  it('a thrown fetch is network, transient', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))))
    const e = await providerError(getSubmitter(ENV, 1))
    expect([e.code, e.transient]).toEqual(['network', true])
  })

  it('listTemplates asks for limit=100 and maps data[] to id and name', async () => {
    const fn = respond(200, JSON.stringify({ data: [{ id: 7, name: 'Form 8821', fields: [] }], pagination: {} }))
    expect(await listTemplates(ENV)).toEqual([{ id: 7, name: 'Form 8821' }])
    expect(fn.mock.calls[0][0]).toBe('https://api.docuseal.com/templates?limit=100')
  })

  it('rejects a non-https embed_src', async () => {
    respond(200, JSON.stringify({ ...JSON.parse(fixture('submitter_pending.json')), embed_src: 'http://evil.example/s/x' }))
    expect((await providerError(getSubmitter(ENV, 5001))).code).toBe('bad_response')
  })

  it('without a key it throws provider_not_configured and calls nothing', async () => {
    const fn = respond(200, '{}')
    const e = await providerError(getSubmitter({ DOCUSEAL_API_URL: 'https://api.docuseal.com' } as unknown as Env, 1))
    expect(e.code).toBe('provider_not_configured')
    expect(fn).not.toHaveBeenCalled()
  })
})
