import { createHash } from 'node:crypto'
import { PDFDocument } from '@cantoo/pdf-lib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_MAX_SOURCE_BYTES,
  normalizeForLogics,
  partFileName,
} from './normalize-for-logics'
import {
  HEIC_STUB,
  makeMultiPagePdf,
  makeOversizedPagePdf,
  TINY_JPEG,
} from './test-fixtures'

const LOGICS_GATE = { targetBytes: 5_767_168 }
const sha256hex = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex')

describe('partFileName', () => {
  it('strips a known extension and adds the part suffix only when split', () => {
    expect(partFileName('a.b.pdf', 2, 3)).toBe('a.b (part 2 of 3).pdf')
    expect(partFileName('scan.JPG', 1, 1)).toBe('scan.pdf')
    expect(partFileName('noext', 1, 1)).toBe('noext.pdf')
  })
})

describe('normalizeForLogics', () => {
  afterEach(() => vi.restoreAllMocks())

  it('passes a PDF under the gate through untouched with its name', async () => {
    const small = await makeMultiPagePdf(2, 1_000)
    const result = await normalizeForLogics(
      { bytes: small, mime: 'application/pdf', name: 'Statement.PDF' },
      LOGICS_GATE
    )
    expect(result).toEqual({
      ok: true,
      parts: [{ fileName: 'Statement.PDF', bytes: small, sha256: sha256hex(small) }],
    })
    if (result.ok) expect(result.parts[0].bytes).toBe(small)
  })

  it('splits an over-gate PDF into named, hashed parts under the gate', async () => {
    const source = await makeMultiPagePdf(12, 50_000)
    const result = await normalizeForLogics(
      { bytes: source, mime: 'application/pdf', name: 'Bank statement.pdf' },
      { targetBytes: 200_000 }
    )
    if (!result.ok) throw new Error(`unexpected ${JSON.stringify(result)}`)
    const n = result.parts.length
    expect(n).toBeGreaterThanOrEqual(3)
    expect(result.parts[0].fileName).toBe(`Bank statement (part 1 of ${n}).pdf`)
    result.parts.forEach((part, i) => {
      expect(part.fileName).toBe(`Bank statement (part ${i + 1} of ${n}).pdf`)
      expect(part.bytes.byteLength).toBeLessThanOrEqual(200_000)
      expect(part.sha256).toBe(sha256hex(part.bytes))
    })
    expect(new Set(result.parts.map((p) => p.sha256)).size).toBe(n)
  })

  it('wraps an image by its magic bytes, not its declared type', async () => {
    const result = await normalizeForLogics(
      { bytes: TINY_JPEG, mime: 'image/png', name: 'photo.png' },
      LOGICS_GATE
    )
    if (!result.ok) throw new Error(`unexpected ${JSON.stringify(result)}`)
    expect(result.parts).toHaveLength(1)
    expect(result.parts[0].fileName).toBe('photo.pdf')
    const doc = await PDFDocument.load(result.parts[0].bytes)
    expect(doc.getPageCount()).toBe(1)
  })

  it('rejects HEIC even when labelled as JPEG', async () => {
    const result = await normalizeForLogics(
      { bytes: HEIC_STUB, mime: 'image/jpeg', name: 'IMG_0001.HEIC' },
      LOGICS_GATE
    )
    expect(result).toEqual({ ok: false, code: 'image_unsupported_format' })
  })

  it('rejects a source over the input cap before parsing it', async () => {
    expect(DEFAULT_MAX_SOURCE_BYTES).toBe(41_943_040)
    const load = vi.spyOn(PDFDocument, 'load')
    const result = await normalizeForLogics(
      { bytes: new Uint8Array(41_943_041), mime: 'application/pdf', name: 'huge.pdf' },
      LOGICS_GATE
    )
    expect(result).toEqual({ ok: false, code: 'source_too_large' })
    expect(load).not.toHaveBeenCalled()
  })

  it('reports a page that alone exceeds the gate', async () => {
    const result = await normalizeForLogics(
      {
        bytes: await makeOversizedPagePdf(300_000),
        mime: 'application/pdf',
        name: 'scan.pdf',
      },
      { targetBytes: 200_000 }
    )
    expect(result).toEqual({ ok: false, code: 'pdf_page_too_large', page: 1 })
  })

  it('reports garbage as pdf_unparseable whatever its declared type', async () => {
    const garbage = new TextEncoder().encode('definitely not a pdf')
    for (const mime of ['application/pdf', 'application/octet-stream']) {
      const result = await normalizeForLogics(
        { bytes: garbage, mime, name: 'x.pdf' },
        LOGICS_GATE
      )
      expect(result).toEqual({ ok: false, code: 'pdf_unparseable' })
    }
  })
})
