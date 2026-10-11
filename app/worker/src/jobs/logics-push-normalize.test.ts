import { createHash } from 'node:crypto'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { addParts, fingerprintHex, type PushJob } from '../db/logics-pushes'
import { HEIC_STUB, makeMultiPagePdf, TINY_JPEG } from '../pdf/test-fixtures'
import { downloadPart, uploadPart } from '../storage/logics-parts'
import { ensureNormalized } from './logics-push-normalize'

vi.mock('../storage/logics-parts', async (orig) => ({
  ...(await orig<typeof import('../storage/logics-parts')>()),
  uploadPart: vi.fn(),
  downloadPart: vi.fn(),
}))
vi.mock('../db/logics-pushes', async (orig) => ({
  ...(await orig<typeof import('../db/logics-pushes')>()),
  addParts: vi.fn(),
}))

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
const send = vi.fn().mockResolvedValue(undefined)
const ENV = { JOBS: { send } } as unknown as Env
const jobFor = (bytes: Uint8Array, over: Partial<PushJob> = {}) =>
  ({
    id: 'P0',
    firm_id: 'f',
    case_id: 'c',
    document_id: 'd',
    part_index: 0,
    part_count: null,
    file_name: 'stmt.pdf',
    part_storage_path: null,
    part_sha256: null,
    storage_key: 'src/key',
    source_sha256: sha(bytes),
    source_mime: 'application/pdf',
    source_bytes: bytes.byteLength,
    ...over,
  }) as PushJob

let small: Uint8Array
let big: Uint8Array
beforeAll(async () => {
  small = await makeMultiPagePdf(1, 2_000)
  big = await makeMultiPagePdf(12, 60_000)
})
beforeEach(() => {
  vi.mocked(addParts).mockImplementation(async (_e, p) => p.parts.slice(1).map((x) => `S${x.partIndex}`))
})
afterEach(() => vi.clearAllMocks())

const source = (bytes: Uint8Array) => vi.mocked(downloadPart).mockResolvedValue(bytes)

describe('ensureNormalized', () => {
  it('a small PDF is one part with its own name, stored once as part-0', async () => {
    source(small)
    const r = await ensureNormalized(ENV, jobFor(small))
    expect(r).toMatchObject({ ok: true, part: { fileName: 'stmt.pdf', partIndex: 0, partCount: 1 } })
    expect(uploadPart).toHaveBeenCalledTimes(1)
    expect(vi.mocked(uploadPart).mock.calls[0][1]).toBe('firm/f/case/c/logics/d/part-0.pdf')
    expect(vi.mocked(addParts).mock.calls[0][1]).toMatchObject({ pushId: 'P0', partCount: 1 })
    expect(vi.mocked(addParts).mock.calls[0][1].parts).toHaveLength(1)
    expect(send).not.toHaveBeenCalled()
  })

  it('splits an oversize PDF into stored parts, mints siblings and enqueues one message each', async () => {
    source(big)
    const job = jobFor(big)
    const r = await ensureNormalized(ENV, job, { targetBytes: 200_000 })
    const parts = vi.mocked(addParts).mock.calls[0][1].parts
    const n = parts.length
    expect(n).toBeGreaterThanOrEqual(3)
    expect(vi.mocked(uploadPart).mock.calls.map((c) => c[1])).toEqual(parts.map((_, k) => `firm/f/case/c/logics/d/part-${k}.pdf`))
    for (const [k, p] of parts.entries()) {
      expect(p.fingerprint).toBe(await fingerprintHex('c', job.source_sha256!, k))
      expect(p.bytes).toBeLessThanOrEqual(200_000)
    }
    expect(vi.mocked(addParts).mock.calls[0][1].partCount).toBe(n)
    expect(send.mock.calls.map((c) => c[0])).toEqual(parts.slice(1).map((p) => ({ type: 'logics_push', provider: 'logics', ref: `S${p.partIndex}` })))
    expect(r).toMatchObject({ ok: true, part: { partIndex: 0, partCount: n, fileName: `stmt (part 1 of ${n}).pdf` } })
  }, 20_000)

  it('is deterministic: a re-run stores the same paths and hashes and calls addParts identically', async () => {
    source(big)
    // The re-run lands in a later second, as an interrupted job's retry would.
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2026-10-11T12:00:00Z'))
      await ensureNormalized(ENV, jobFor(big), { targetBytes: 200_000 })
      vi.setSystemTime(new Date('2026-10-11T12:05:00Z'))
      await ensureNormalized(ENV, jobFor(big), { targetBytes: 200_000 })
    } finally {
      vi.useRealTimers()
    }
    const [first, second] = vi.mocked(addParts).mock.calls.map((c) => c[1])
    expect(second).toEqual(first)
  }, 20_000) // two 12-page splits; slow when the machine is busy

  it('a stored part is re-read as is: no normalization, no addParts, no messages', async () => {
    source(small)
    const r = await ensureNormalized(ENV, jobFor(big, { part_index: 2, part_count: 4, part_storage_path: 'x/part-2.pdf', part_sha256: sha(small) }))
    expect(downloadPart).toHaveBeenCalledWith(ENV, 'x/part-2.pdf')
    expect(r).toMatchObject({ ok: true, part: { partIndex: 2, partCount: 4 } })
    expect(addParts).not.toHaveBeenCalled()
    expect(uploadPart).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('a stored part whose bytes changed is part_hash_mismatch', async () => {
    source(small)
    const r = await ensureNormalized(ENV, jobFor(big, { part_storage_path: 'x', part_sha256: 'nope' }))
    expect(r).toMatchObject({ ok: false, code: 'part_hash_mismatch', manual: false })
  })

  it('a JPEG becomes one PDF named {base}.pdf', async () => {
    source(TINY_JPEG)
    const r = await ensureNormalized(ENV, jobFor(TINY_JPEG, { file_name: 'id.jpg', source_mime: 'image/jpeg' }))
    expect(r).toMatchObject({ ok: true, part: { fileName: 'id.pdf', partCount: 1 } })
  })

  it('HEIC is a manual-compression failure with staff copy', async () => {
    source(HEIC_STUB)
    const r = await ensureNormalized(ENV, jobFor(HEIC_STUB, { file_name: 'p.heic', source_mime: 'image/heic' }))
    expect(r).toEqual({ ok: false, code: 'image_unsupported_format', manual: true, detail: 'Ask the client to re-upload as JPG or PDF.' })
    expect(uploadPart).not.toHaveBeenCalled()
  })

  it('source bytes that do not match documents.sha256 are source_hash_mismatch', async () => {
    source(small)
    const r = await ensureNormalized(ENV, jobFor(small, { source_sha256: 'f'.repeat(64) }))
    expect(r).toMatchObject({ ok: false, code: 'source_hash_mismatch', manual: false })
  })

  it('a Storage download error is storage_read_failed, not manual', async () => {
    vi.mocked(downloadPart).mockRejectedValue(new Error('storage_read_failed'))
    const r = await ensureNormalized(ENV, jobFor(small))
    expect(r).toMatchObject({ ok: false, code: 'storage_read_failed', manual: false })
  })
})
