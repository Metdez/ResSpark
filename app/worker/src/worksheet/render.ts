// Draws the worksheet layout with pdf-lib's standard Helvetica fonts: plain text only, no form fields.
import { PageSizes, PDFDocument, StandardFonts } from '@cantoo/pdf-lib'
import { layoutWorksheet, type WorksheetInput } from './layout'

export async function renderWorksheet(input: WorksheetInput): Promise<{ bytes: Uint8Array; pages: number }> {
  const doc = await PDFDocument.create()
  doc.setTitle('433-A screening worksheet (not an IRS form)')
  doc.setProducer('ResSpark')
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const fontOf = (isBold: boolean | undefined) => (isBold ? bold : regular)
  const pages = layoutWorksheet(input, (text, size, isBold) => fontOf(isBold).widthOfTextAtSize(text, size))
  for (const p of pages) {
    const page = doc.addPage(PageSizes.Letter)
    for (const l of p.lines) {
      const font = fontOf(l.bold)
      const x = l.align === 'right' ? l.x - font.widthOfTextAtSize(l.text, l.size) : l.x
      page.drawText(l.text, { x, y: l.y, size: l.size, font })
    }
  }
  return { bytes: await doc.save({ objectsPerTick: Infinity }), pages: pages.length }
}
