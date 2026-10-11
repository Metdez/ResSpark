import { describe, expect, it } from 'vitest'
import { SECTIONS } from '../financials/lines'
import { FOOTER_TEXT, HEADER_TEXT, layoutWorksheet, type WorksheetPage } from './layout'
import { sampleInput, sampleRun } from './test-input'
import { money, toWinAnsi } from './text'

// Fixed-width measure: half the font size per character.
const measure = (text: string, size: number) => text.length * size * 0.5
const textOf = (pages: WorksheetPage[]) => pages.flatMap((p) => p.lines.map((l) => l.text)).join(' ')

describe('text', () => {
  it('replaces characters outside Windows-1252 and control characters', () => {
    expect(toWinAnsi('Zoë 王 — ok')).toBe('Zoë ? — ok')
    expect(toWinAnsi('a\tb\nc')).toBe('a b c')
    expect(toWinAnsi('“quoted” € 😀')).toBe('“quoted” € ?')
  })

  it('formats US dollars', () => {
    expect(money(1234.5)).toBe('$1,234.50')
    expect(money(-3)).toBe('-$3.00')
  })
})

describe('layoutWorksheet', () => {
  it('puts the header first and the numbered footer last on every page', () => {
    const pages = layoutWorksheet(sampleInput(), measure)
    expect(pages.length).toBeGreaterThanOrEqual(1)
    pages.forEach((p, i) => {
      expect(p.lines[0].text).toBe(HEADER_TEXT)
      expect(p.lines[p.lines.length - 1].text).toBe(`${FOOTER_TEXT} Page ${i + 1} of ${pages.length}`)
    })
  })

  it('breaks long content onto more pages with consecutive page numbers', () => {
    const flags = Array.from({ length: 40 }, (_, i) => `Review flag number ${i + 1} needs a professional to look at it.`)
    const pages = layoutWorksheet(sampleInput({ run: sampleRun({ review_flags: flags }) }), measure)
    expect(pages.length).toBeGreaterThanOrEqual(2)
    expect(textOf(pages)).toContain('Page 2 of')
    pages.forEach((p, i) => expect(p.lines[p.lines.length - 1].text.endsWith(`Page ${i + 1} of ${pages.length}`)).toBe(true))
    for (const p of pages) for (const l of p.lines.slice(1, -1)) expect(l.y).toBeGreaterThanOrEqual(60)
    expect(textOf(pages)).toContain(flags[39])
  })

  it('shows every section, the expense table, the boxes, NRE lines and the recommendation verbatim', () => {
    const input = sampleInput()
    const text = textOf(layoutWorksheet(input, measure))
    for (const s of SECTIONS) expect(text).toContain(s.title)
    for (const word of ['Actual', 'IRS standard', 'Allowed', 'Box D', 'Box E', 'Box F']) expect(text).toContain(word)
    for (const l of input.run.nre_lines) expect(text).toContain(l.label)
    expect(text).toContain(input.run.path)
    expect(text).toContain(input.run.reason)
    expect(text).toContain('A tax professional must review this result before anything is filed.')
    expect(text).toContain(money(input.run.monthly_income))
    expect(text).toContain(money(input.run.net_disposable_income))
  })

  it('shows the payment math of a payment path', () => {
    const text = textOf(layoutWorksheet(sampleInput(), measure))
    expect(text).toContain('$28,000.00 ÷ 90 months, rounded up to the cent = $311.12')
  })

  it('takes line values from the snapshot only', () => {
    const base = sampleInput()
    expect(textOf(layoutWorksheet(base, measure))).not.toContain('$7,123.45')
    const changed = sampleInput({ snapshot: { ...base.snapshot, gross_wages_taxpayer: 7123.45 } })
    expect(textOf(layoutWorksheet(changed, measure))).toContain('$7,123.45')
  })

  it('names the source of a confirmed value', () => {
    const text = textOf(layoutWorksheet(sampleInput(), measure))
    expect(text).toContain('Plaid, Test agent')
    expect(text).toContain('Staff (edited)')
  })

  it('lists vehicles one per row and sanitizes names', () => {
    const text = textOf(layoutWorksheet(sampleInput({ client_name: 'Zoë 王' }), measure))
    expect(text).toContain('Vehicle 1')
    expect(text).toContain('$15,000.00')
    expect(text).toContain('Zoë ?')
  })
})
