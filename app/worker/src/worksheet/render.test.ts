import { PDFDocument } from '@cantoo/pdf-lib'
import { describe, expect, it } from 'vitest'
import { renderWorksheet } from './render'
import { sampleInput, sampleRun } from './test-input'

describe('renderWorksheet', () => {
  it('renders a PDF whose page count matches the layout', async () => {
    const flags = Array.from({ length: 60 }, (_, i) => `Flag ${i + 1}`)
    const { bytes, pages } = await renderWorksheet(sampleInput({ run: sampleRun({ review_flags: flags }) }))
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    expect(pages).toBeGreaterThanOrEqual(2)
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(pages)
  })

  it('does not fail on a client name outside Windows-1252', async () => {
    const { bytes } = await renderWorksheet(sampleInput({ client_name: '王小明 Zoë 😀' }))
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(1)
  })
})
