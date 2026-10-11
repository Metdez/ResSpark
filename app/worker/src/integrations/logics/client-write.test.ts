import { describe, expect, it, vi } from 'vitest'
import { createLogicsClient } from './client'

// Vendor contract: Logics_API_Documentation.docx.md 846-905 (CaseActivity/Activity) and 943-974
// (Documents/CaseDocument). Every outcome maps onto sent | failed | unknown; nothing throws.
const BASE = 'https://x.logiqsapi.com/publicapi/V4/'
const AUTH = 'Basic ' + btoa('K:S')
const DOC_OK = { Success: true, data: { CaseDocumentID: 128346 }, message: 'File uploaded succefully by User: Pedro Medina' }
const ACT_OK = { Success: true, data: { ActivityID: 9164821 }, message: 'Case activity created successfully' }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

const setup = (result: Response | Error) => {
  const fetchStub = vi.fn()
  if (result instanceof Error) fetchStub.mockRejectedValue(result)
  else fetchStub.mockResolvedValue(result)
  return { client: createLogicsClient({ baseUrl: BASE, apiKey: 'K', secretToken: 'S' }, fetchStub), fetchStub }
}
const callOf = (fetchStub: ReturnType<typeof vi.fn>) => fetchStub.mock.calls[0] as [string, RequestInit]

const doc = (bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]), fileCategoryId?: number) => ({
  caseId: 900001,
  comment: 'Uploaded via ResSpark by Dana Agent — stmt.pdf',
  fileName: 'stmt.pdf',
  bytes,
  ...(fileCategoryId === undefined ? {} : { fileCategoryId }),
})

describe('createCaseDocument', () => {
  it('refuses a 5_767_169-byte part with size_gate and never calls fetch', async () => {
    const { client, fetchStub } = setup(json(DOC_OK))
    await expect(client.createCaseDocument(doc(new Uint8Array(5_767_169)))).resolves.toEqual({
      kind: 'failed',
      status: 0,
      code: 'size_gate',
    })
    expect(fetchStub).not.toHaveBeenCalled()
  })

  it('sends a part of exactly 5_767_168 bytes', async () => {
    const { client, fetchStub } = setup(json(DOC_OK))
    await expect(client.createCaseDocument(doc(new Uint8Array(5_767_168)))).resolves.toEqual({
      kind: 'sent',
      logicsDocumentId: 128346,
    })
    expect(fetchStub).toHaveBeenCalledTimes(1)
  })

  it('POSTs multipart CaseID, Comment, File with Basic auth, no content-type, a 60 s timeout', async () => {
    const { client, fetchStub } = setup(json(DOC_OK))
    await client.createCaseDocument(doc())
    const [url, init] = callOf(fetchStub)
    expect(url).toBe(new URL('Documents/CaseDocument', BASE).toString())
    expect(init.method).toBe('POST')
    const headers = new Headers(init.headers)
    expect(headers.get('authorization')).toBe(AUTH)
    expect(headers.has('content-type')).toBe(false)
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(init.body instanceof FormData).toBe(true)
    const body = init.body as FormData
    expect(body.get('CaseID')).toBe('900001')
    expect(body.get('Comment')).toBe('Uploaded via ResSpark by Dana Agent — stmt.pdf')
    const file = body.get('File') as File
    expect(file).toBeInstanceOf(File)
    expect(file.name).toBe('stmt.pdf')
    expect(file.type).toBe('application/pdf')
    expect(body.has('FileCategoryID')).toBe(false)
  })

  it('adds FileCategoryID only when configured', async () => {
    const { client, fetchStub } = setup(json(DOC_OK))
    await client.createCaseDocument(doc(undefined, 7))
    expect((callOf(fetchStub)[1].body as FormData).get('FileCategoryID')).toBe('7')
  })

  it.each([
    ['a 200 without CaseDocumentID', json({ Success: true, message: 'ok' }), { kind: 'unknown', code: 'logics_unparsed_200' }],
    ['a 200 with a string CaseDocumentID', json({ Success: true, data: { CaseDocumentID: '128346' } }), { kind: 'unknown', code: 'logics_unparsed_200' }],
    ['a 200 with a non-JSON body', new Response('<html>ok</html>', { status: 200 }), { kind: 'unknown', code: 'logics_unparsed_200' }],
    ['401', json({ message: 'no' }, 401), { kind: 'failed', status: 401, code: 'logics_auth' }],
    ['403', json({ message: 'no' }, 403), { kind: 'failed', status: 403, code: 'logics_scope' }],
    ['404', json({}, 404), { kind: 'failed', status: 404, code: 'logics_rejected_404' }],
    ['500', json({}, 500), { kind: 'unknown', code: 'logics_5xx' }],
    ['a network TypeError', new TypeError('fetch failed'), { kind: 'unknown', code: 'logics_no_response' }],
    ['an AbortError timeout', new DOMException('timed out', 'AbortError'), { kind: 'unknown', code: 'logics_no_response' }],
  ])('maps %s', async (_name, result, expected) => {
    const { client } = setup(result as Response | Error)
    await expect(client.createCaseDocument(doc())).resolves.toEqual(expected)
  })
})

describe('createActivity', () => {
  const activity = { caseId: 900001, activityType: 'General', subject: 'Documents uploaded via ResSpark', comment: 'x' }

  it('POSTs JSON with Popup and Pin false and returns the ActivityID', async () => {
    const { client, fetchStub } = setup(json(ACT_OK))
    await expect(client.createActivity(activity)).resolves.toEqual({ kind: 'sent', activityId: 9164821 })
    const [url, init] = callOf(fetchStub)
    expect(url).toBe(new URL('CaseActivity/Activity', BASE).toString())
    expect(init.method).toBe('POST')
    const headers = new Headers(init.headers)
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('authorization')).toBe(AUTH)
    expect(JSON.parse(init.body as string)).toEqual({
      CaseID: 900001,
      ActivityType: 'General',
      Subject: 'Documents uploaded via ResSpark',
      Comment: 'x',
      Popup: false,
      Pin: false,
    })
  })

  it.each([
    [json({ Success: true, data: {} }), { kind: 'unknown', code: 'logics_unparsed_200' }],
    [json({}, 401), { kind: 'failed', status: 401, code: 'logics_auth' }],
    [json({}, 403), { kind: 'failed', status: 403, code: 'logics_scope' }],
    [json({}, 422), { kind: 'failed', status: 422, code: 'logics_rejected_422' }],
    [json({}, 503), { kind: 'unknown', code: 'logics_5xx' }],
    [new TypeError('fetch failed'), { kind: 'unknown', code: 'logics_no_response' }],
  ])('maps outcome %#', async (result, expected) => {
    const { client } = setup(result)
    await expect(client.createActivity(activity)).resolves.toEqual(expected)
  })
})

describe('capitalized envelope (live tenant)', () => {
  it('counts Success/Data as proof for both writes', async () => {
    const docClient = setup(json({ Success: true, Data: { CaseDocumentID: 128346 }, Message: 'ok' })).client
    await expect(docClient.createCaseDocument(doc())).resolves.toEqual({ kind: 'sent', logicsDocumentId: 128346 })
    const { client } = setup(json({ Success: true, Data: { ActivityID: 9164821 }, Message: 'ok' }))
    const note = { caseId: 900001, activityType: 'General', subject: 'Documents uploaded via ResSpark', comment: 'x' }
    await expect(client.createActivity(note)).resolves.toEqual({ kind: 'sent', activityId: 9164821 })
  })
})

describe('listActivities', () => {
  it('GETs CaseActivity/Activity with CaseID on the query string and reads a single-object data', async () => {
    const { client, fetchStub } = setup(json({ Success: true, data: { ActivityID: 1, ActivityType: 'General' } }))
    await expect(client.listActivities(900001)).resolves.toEqual({ activityTypes: ['General'] })
    const [url, init] = callOf(fetchStub)
    expect(url).toBe(BASE + 'CaseActivity/Activity?CaseID=900001')
    expect(init.method).toBe('GET')
  })

  it('dedupes, sorts and drops empty types from an array data', async () => {
    const data = [{ ActivityType: 'General' }, { ActivityType: 'Document sent' }, { ActivityType: '' }, { ActivityType: 'General' }, {}]
    const { client } = setup(json({ Success: true, data }))
    await expect(client.listActivities(900001)).resolves.toEqual({ activityTypes: ['Document sent', 'General'] })
  })

  it('returns failed with the status for a 403', async () => {
    const { client } = setup(json({}, 403))
    await expect(client.listActivities(900001)).resolves.toEqual({ kind: 'failed', status: 403 })
  })
})
