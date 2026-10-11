import { afterEach, describe, expect, it, vi } from 'vitest'
import { fixtureText } from '../../../test/fixtures/connections'
import type { ConnectionRow } from '../../db/connections'
import type { DsSubmission } from './docuseal'
import { collectArtifacts, downloadArtifact, ingestSignedArtifacts } from './ingest'

const store = vi.hoisted(() => vi.fn())
vi.mock('../../storage/connection-files', () => ({ storeProviderFile: store }))

const completed = (): DsSubmission => JSON.parse(fixtureText('docuseal/submission_completed.json'))
const codeOf = async (p: Promise<unknown>) => p.then(() => null, (e: { code: string; transient: boolean }) => e)

afterEach(() => {
  vi.unstubAllGlobals()
  store.mockReset()
})

describe('collectArtifacts', () => {
  it('names the signed document from its title and adds the audit log', () => {
    expect(collectArtifacts(completed(), 5001)).toEqual([
      { document_type: 'signed_document', name: 'signed-1-Engagement_letter_demo_.pdf', url: 'https://docuseal.com/file/signed-fixture.pdf' },
      { document_type: 'esign_audit_log', name: 'audit-log.pdf', url: 'https://docuseal.com/file/audit-fixture.pdf' },
    ])
  })

  it("falls back to the submitter's documents when the submission has none", () => {
    const sub = completed()
    sub.documents = []
    sub.submitters[0].documents = [{ name: 'Form 8821.pdf', url: 'https://docuseal.com/file/own.pdf' }]
    expect(collectArtifacts(sub, 5001).map((a) => a.name)).toEqual(['signed-1-Form_8821.pdf', 'audit-log.pdf'])
  })

  it('returns [] while documents are empty', () => {
    const sub = completed()
    sub.documents = []
    sub.submitters[0].documents = []
    expect(collectArtifacts(sub, 5001)).toEqual([])
  })

  it('returns [] while the audit log is not ready', () => {
    expect(collectArtifacts({ ...completed(), audit_log_url: null }, 5001)).toEqual([])
  })

  it('keeps two documents with the same name apart', () => {
    const sub = completed()
    sub.documents = [sub.documents[0], sub.documents[0]]
    const names = collectArtifacts(sub, 5001).map((a) => a.name)
    expect(new Set(names).size).toBe(3)
  })
})

describe('downloadArtifact', () => {
  it('refuses a non-https URL with bad_url and does not fetch', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await codeOf(downloadArtifact('http://docuseal.com/x'))).toMatchObject({ code: 'bad_url', transient: false })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('treats a 404 as a transient file_download_failed (the retry gets fresh URLs)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    expect(await codeOf(downloadArtifact('https://docuseal.com/file/x.pdf'))).toMatchObject({ code: 'file_download_failed', transient: true })
  })

  it('treats a 403 as a permanent file_download_failed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 403 })))
    expect(await codeOf(downloadArtifact('https://docuseal.com/file/x.pdf'))).toMatchObject({ code: 'file_download_failed', transient: false })
  })

  it('sends no x-auth-token to the document host', async () => {
    const fetchSpy = vi.fn(async (_url: string, _init?: RequestInit) => new Response('%PDF-1.4'))
    vi.stubGlobal('fetch', fetchSpy)
    await downloadArtifact('https://docuseal.com/file/x.pdf')
    const init = fetchSpy.mock.calls[0][1]
    expect(new Headers(init?.headers).get('x-auth-token')).toBeNull()
  })
})

describe('ingestSignedArtifacts', () => {
  it('stores each artifact as a signature file under the submission id, acted by provider:docuseal', async () => {
    store.mockResolvedValueOnce({ document_id: 'd1', created: true }).mockResolvedValueOnce({ document_id: 'd2', created: false })
    const conn = { id: 'CONN' } as ConnectionRow
    const res = await ingestSignedArtifacts({} as Env, conn, 4001, collectArtifacts(completed(), 5001))
    expect(res).toEqual({ created: 1, document_ids: ['d1', 'd2'] })
    expect(store).toHaveBeenCalledTimes(2)
    expect(store.mock.calls[0][1]).toMatchObject({
      conn,
      kind: 'signature',
      group: '4001',
      name: 'signed-1-Engagement_letter_demo_.pdf',
      mime: 'application/pdf',
      document_type: 'signed_document',
      actor: 'provider:docuseal',
    })
    expect(store.mock.calls[1][1]).toMatchObject({ name: 'audit-log.pdf', document_type: 'esign_audit_log' })
    expect(typeof store.mock.calls[0][1].bytes).toBe('function')
  })
})
