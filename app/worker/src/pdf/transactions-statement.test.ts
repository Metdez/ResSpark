import { PDFDocument } from '@cantoo/pdf-lib'
import { describe, expect, it } from 'vitest'
import type { WorksheetPage } from '../worksheet/layout'
import {
  DISCLAIMER,
  DOC_TITLE,
  HEADER_TEXT,
  layoutTransactionStatement,
  longMonth,
  renderTransactionStatement,
  signedMoney,
  totals,
  type StatementTransaction,
  type TransactionStatementInput,
} from './transactions-statement'

// Fixed-width measure: half the font size per character.
const measure = (text: string, size: number) => text.length * size * 0.5
const textOf = (pages: WorksheetPage[]) => pages.flatMap((p) => p.lines.map((l) => l.text)).join(' ')
// Lines that share a baseline, left to right, joined with ' | '.
const rowsOf = (pages: WorksheetPage[]) =>
  pages.flatMap((p) => {
    const byY = new Map<number, string[]>()
    for (const l of p.lines) byY.set(l.y, [...(byY.get(l.y) ?? []), l.text])
    return [...byY.values()].map((r) => r.join(' | '))
  })

const txn = (over: Partial<StatementTransaction>): StatementTransaction => ({
  date: '2026-09-15',
  name: 'Transfer',
  merchant_name: null,
  amount: 10,
  pending: false,
  ...over,
})
const input = (over: Partial<TransactionStatementInput> = {}): TransactionStatementInput => ({
  accountName: 'Checking',
  mask: '1234',
  year: 2026,
  month: 9,
  transactions: [
    txn({ date: '2026-09-20', name: 'Rent', amount: 12.34 }),
    txn({ date: '2026-09-01', name: 'Payroll', merchant_name: 'ACME Payroll', amount: -1000 }),
    txn({ date: '2026-09-10', name: null, merchant_name: null, amount: 5.66 }),
  ],
  ...over,
})

describe('signedMoney and totals', () => {
  it('shows a positive (money out) amount with a minus and a negative (money in) with a plus', () => {
    expect(signedMoney(12.34)).toBe('-$12.34')
    expect(signedMoney(-1000)).toBe('+$1,000.00')
    expect(signedMoney(0)).toBe('$0.00')
  })

  it('sums money in, money out and the net to the cent', () => {
    expect(totals(input().transactions)).toEqual({ moneyIn: 1000, moneyOut: 18, net: 982 })
    expect(totals([txn({ amount: 0.1 }), txn({ amount: 0.2 })])).toEqual({ moneyIn: 0, moneyOut: 0.3, net: -0.3 })
  })
})

describe('layoutTransactionStatement', () => {
  it('prints the title, the account, the disclaimer, the rows by date and the totals block', () => {
    const rows = rowsOf(layoutTransactionStatement(input(), measure))
    expect(rows).toContain('Transaction statement — September 2026')
    expect(rows).toContain('Checking ••1234')
    expect(textOf(layoutTransactionStatement(input(), measure))).toContain(DISCLAIMER)
    expect(rows).toContain('Date | Description | Amount')
    const body = rows.filter((r) => /^2026-/.test(r))
    expect(body).toEqual(['2026-09-01 | ACME Payroll | +$1,000.00', '2026-09-10 | — | -$5.66', '2026-09-20 | Rent | -$12.34'])
    expect(rows).toContain('Money in | $1,000.00')
    expect(rows).toContain('Money out | $18.00')
    expect(rows).toContain('Net | $982.00')
  })

  it('shows a negative net with a minus and falls back to "Account" without a name or mask', () => {
    const rows = rowsOf(layoutTransactionStatement(input({ accountName: null, mask: null, transactions: [txn({ amount: 40 })] }), measure))
    expect(rows).toContain('Account')
    expect(rows).toContain('Net | -$40.00')
  })

  it('puts the header first and the numbered footer last on every page', () => {
    const pages = layoutTransactionStatement(input(), measure)
    expect(pages).toHaveLength(1)
    pages.forEach((p, i) => {
      expect(p.lines[0].text).toBe(HEADER_TEXT)
      expect(p.lines[p.lines.length - 1].text).toBe(`${DISCLAIMER} Page ${i + 1} of ${pages.length}`)
    })
  })

  it('breaks 120 rows onto more pages with consecutive page numbers and nothing below the bottom margin', () => {
    const transactions = Array.from({ length: 120 }, (_, i) => txn({ date: `2026-09-${String((i % 30) + 1).padStart(2, '0')}`, name: `Row ${i + 1}`, amount: i + 1 }))
    const pages = layoutTransactionStatement(input({ transactions }), measure)
    expect(pages.length).toBeGreaterThanOrEqual(3)
    pages.forEach((p, i) => {
      expect(p.lines[0].text).toBe(HEADER_TEXT)
      expect(p.lines[p.lines.length - 1].text.endsWith(`Page ${i + 1} of ${pages.length}`)).toBe(true)
      for (const l of p.lines.slice(1, -1)) expect(l.y).toBeGreaterThanOrEqual(70)
    })
    expect(textOf(pages)).toContain('Row 120')
    expect(rowsOf(pages)).toContain('Money out | $7,260.00')
  })

  it('replaces characters outside Windows-1252 and truncates a long description', () => {
    const long = 'A very long merchant description that keeps going well past the column width of the page'
    const rows = rowsOf(layoutTransactionStatement(input({ transactions: [txn({ merchant_name: '王 Café 😀' }), txn({ merchant_name: long })] }), measure))
    expect(rows.some((r) => r.includes('? Café ?'))).toBe(true)
    const cut = rows.find((r) => r.includes('A very long'))!
    expect(cut.includes(long)).toBe(false)
    expect(cut).toContain('…')
  })

  it('names months in full for the file label', () => {
    expect(longMonth(2026, 1)).toBe('January 2026')
    expect(longMonth(2025, 12)).toBe('December 2025')
  })
})

describe('renderTransactionStatement', () => {
  it('renders a titled PDF whose page count matches the layout', async () => {
    const bytes = await renderTransactionStatement(input())
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
    expect(doc.getTitle()).toBe(DOC_TITLE)
  })
})
