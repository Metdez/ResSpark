import { afterEach, describe, expect, it, vi } from 'vitest'
import { completeUpload, listItemDocuments, mintUpload } from './api'
import { errorCopy } from './copy'

function reply(status: number, body: unknown) {
  const m = vi.fn(async (_path: string, _init: RequestInit) => ({
    ok: status < 300,
    status,
    json: async () => body,
  }))
  vi.stubGlobal('fetch', m)
  return m
}

afterEach(() => vi.unstubAllGlobals())

describe('uploads api', () => {
  it('mints through portalFetch with the CSRF header and the file facts', async () => {
    const mint = { document_id: 'D1', path: 'p', token: 't', signed_url: 'u' }
    const m = reply(201, mint)
    await expect(
      mintUpload('I1', { name: 'a.pdf', mime: 'application/pdf', size: 3 })
    ).resolves.toEqual(mint)
    const [path, init] = m.mock.calls[0] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ]
    expect(path).toBe('/api/c/items/I1/uploads')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('same-origin')
    expect(init.headers['X-Requested-With']).toBe('ResSpark')
    expect(JSON.parse(String(init.body))).toEqual({
      name: 'a.pdf',
      mime: 'application/pdf',
      size: 3,
    })
  })

  it('surfaces the Worker error code for the copy map', async () => {
    reply(409, { error: { code: 'too_many_files', message: 'x' } })
    const err = await completeUpload('D1', { sha256: 'a', size: 1 }).catch(
      (e: unknown) => e
    )
    expect(err).toMatchObject({ status: 409, code: 'too_many_files' })
  })

  it('rejects a documents list whose shape is wrong', async () => {
    reply(200, { item: { id: 'I1' }, documents: [] })
    await expect(listItemDocuments('I1')).rejects.toMatchObject({
      code: 'invalid_response',
    })
  })

  it('maps known codes to one sentence and unknown codes to the generic line', () => {
    expect(errorCopy('too_many_files')).toBe(
      'You can add up to 10 files for this item.'
    )
    expect(errorCopy('toString')).toBe('Something went wrong. Try again.')
  })
})
