import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument } from '@cantoo/pdf-lib'
import { describe, expect, it } from 'vitest'
import { splitPdf } from './split-pdf'
import {
  makeEncryptedPdf,
  makeMultiPagePdf,
  makeOversizedPagePdf,
  readPadIndex,
} from './test-fixtures'

const LOGICS_GATE = 5_767_168
const EXAMPLES = join(import.meta.dirname, '../../../../examples')

describe('splitPdf', () => {
  it('returns a PDF at or under the gate untouched', async () => {
    const small = await makeMultiPagePdf(2, 1_000)
    const result = await splitPdf(small, LOGICS_GATE)
    expect(result).toEqual({ parts: [small] })
    if ('parts' in result) expect(result.parts[0]).toBe(small)
  })

  it('splits greedily, keeps every part under the gate, and preserves page order', async () => {
    const source = await makeMultiPagePdf(12, 50_000)
    const result = await splitPdf(source, 200_000)
    if (!('parts' in result)) throw new Error(`unexpected ${JSON.stringify(result)}`)

    expect(result.parts.length).toBeGreaterThanOrEqual(3)
    const order: number[] = []
    const pageCounts: number[] = []
    for (const part of result.parts) {
      expect(part.byteLength).toBeLessThanOrEqual(200_000)
      const doc = await PDFDocument.load(part)
      pageCounts.push(doc.getPageCount())
      order.push(...doc.getPages().map(readPadIndex))
    }
    expect(pageCounts.reduce((a, b) => a + b, 0)).toBe(12)
    expect(pageCounts[0]).toBeGreaterThanOrEqual(2)
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })

  it('names a single page that alone exceeds the gate', async () => {
    const result = await splitPdf(await makeOversizedPagePdf(300_000), 200_000)
    expect(result).toEqual({ error: 'pdf_page_too_large', page: 1 })
  })

  it('names the first oversized page in the middle of a document', async () => {
    const source = await makeMultiPagePdf(12, (i) => (i === 6 ? 300_000 : 20_000))
    const result = await splitPdf(source, 200_000)
    expect(result).toEqual({ error: 'pdf_page_too_large', page: 7 })
  })

  it('reports bytes that are not a PDF as pdf_unparseable', async () => {
    const result = await splitPdf(new Uint8Array([1, 2, 3, 4, 5]), 2)
    expect(result).toEqual({ error: 'pdf_unparseable' })
  })

  it('reports a user-password PDF as pdf_encrypted', async () => {
    const result = await splitPdf(await makeEncryptedPdf(), 100)
    expect(result).toEqual({ error: 'pdf_encrypted' })
  })

  it('passes every examples/ PDF through unchanged at the Logics gate', async () => {
    const files = readdirSync(EXAMPLES, { recursive: true, encoding: 'utf8' })
      .filter((f) => f.toLowerCase().endsWith('.pdf'))
    expect(files.length).toBeGreaterThanOrEqual(5)
    for (const file of files) {
      const bytes = new Uint8Array(readFileSync(join(EXAMPLES, file)))
      expect(await splitPdf(bytes, LOGICS_GATE)).toEqual({ parts: [bytes] })
    }
  })
})
