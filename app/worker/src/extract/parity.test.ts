import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { Rows } from './fields'
import { mergeDocuments } from './merge'
import { ExtractError, parsePdf, parseTexts, type ParsedDocument } from './parse'
import { pageText } from './pdf-text'

interface Outcome {
  expected?: Record<string, unknown>
  error?: string
}

interface Golden {
  texts_cases: Array<Outcome & { name: string; texts: string[]; rows: Rows; document_type: string | null }>
  merge_cases: Array<{ name: string; parts: ParsedDocument[]; expected: Record<string, unknown> }>
  pdfs: Array<Outcome & { path: string; document_type: string | null; page_text: { texts: string[]; rows: Rows } }>
  packets: Array<{ dir: string; expected: Record<string, unknown> }>
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../../')
const golden = JSON.parse(readFileSync(`${ROOT}app/worker/test/fixtures/engine/golden-extract.json`, 'utf8')) as Golden
const pdfBytes = (path: string) => new Uint8Array(readFileSync(`${ROOT}${path}`))

describe('extract parity with src/document_parse.py (golden-extract.json)', () => {
  it('has fixtures to compare', () => {
    expect(golden.pdfs.length).toBeGreaterThan(0)
  })

  it.each(golden.texts_cases.map((item) => [item.name, item] as const))('parse_texts %s', (_name, item) => {
    const run = () => parseTexts(item.texts, item.rows, item.document_type)
    if (item.error === undefined) expect(run()).toEqual(item.expected)
    else {
      expect(run).toThrow(ExtractError)
      expect(run).toThrow(new Error(item.error))
    }
  })

  it.each(golden.pdfs.map((item) => [item.path, item] as const))('page text and parse of %s', async (path, item) => {
    const bytes = pdfBytes(path)
    expect(await pageText(bytes)).toEqual(item.page_text)
    const parsed = parsePdf(bytes, item.document_type, path)
    if (item.error === undefined) expect(await parsed).toEqual(item.expected)
    else await expect(parsed).rejects.toThrow(new Error(item.error))
  })

  it.each(golden.merge_cases.map((item) => [item.name, item] as const))('merge_documents %s', (_name, item) => {
    expect(mergeDocuments(item.parts)).toEqual(item.expected)
  })

  it.each(golden.packets.map((item) => [item.dir, item] as const))('parse_packet %s', async (dir, item) => {
    // parse_packet reads the folder's PDFs sorted by path; the fixture lists them in that order.
    const paths = golden.pdfs.map((pdf) => pdf.path).filter((path) => path.startsWith(`${dir}/`))
    expect(paths.length).toBeGreaterThan(0)
    const parts = await Promise.all(paths.map((path) => parsePdf(pdfBytes(path), null, path)))
    expect(mergeDocuments(parts)).toEqual(item.expected)
  })
})
