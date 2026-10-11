import { PDFDocument } from '@cantoo/pdf-lib'
import { describe, expect, it } from 'vitest'
import {
  HEIC_STUB,
  makeMultiPagePdf,
  makeOversizedPagePdf,
  TINY_JPEG,
  TINY_PNG,
} from './test-fixtures'

describe('pdf test fixtures', () => {
  it('makeMultiPagePdf keeps its per-page pads uncompressed', async () => {
    const bytes = await makeMultiPagePdf(12, 50_000)
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(12)
    expect(bytes.byteLength).toBeGreaterThanOrEqual(12 * 50_000 * 0.9)
  })

  it('makeOversizedPagePdf is one page of at least the requested size', async () => {
    const bytes = await makeOversizedPagePdf(300_000)
    expect(bytes.byteLength).toBeGreaterThanOrEqual(270_000)
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
  })

  it('image constants carry the right magic bytes', () => {
    expect([...TINY_JPEG.slice(0, 3)]).toEqual([0xff, 0xd8, 0xff])
    expect([...TINY_PNG.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
    expect(new TextDecoder().decode(HEIC_STUB.slice(4, 12))).toBe('ftypheic')
  })
})
