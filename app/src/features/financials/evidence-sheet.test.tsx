import { afterEach, describe, expect, it, vi } from 'vitest'
import { button, cleanup, click, renderWithQuery, waitFor } from '@/test-utils/query-render'
import * as api from './api'
import type { EvidenceView } from './api'
import { FinancialsPage } from './financials-page'
import { makeView, P3 } from './test-fixtures'

vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('./api', async (orig) => ({
  ...(await orig<typeof import('./api')>()),
  getFinancials: vi.fn(),
  latestEvaluation: vi.fn(),
  getEvidence: vi.fn(),
}))

const txn = (id: string, date: string) => ({ id, date, name: 'Interest', merchant_name: null, amount: 12.5, account: 'Checking ••0000' })
const BANK: EvidenceView = {
  kind: 'bank',
  column: 'interest_dividends_royalties',
  label: 'Interest, dividends and royalties',
  proposal_id: P3,
  window: { start: '2026-07-01', end: '2026-09-30', months: 3 },
  months: [
    { month: '2026-07-01', subtotal: 12.5, transactions: [txn('t1', '2026-07-10')] },
    { month: '2026-08-01', subtotal: 12.5, transactions: [txn('t2', '2026-08-10')] },
    { month: '2026-09-01', subtotal: 12.5, transactions: [txn('t3', '2026-09-10')] },
  ],
  average: 12.5,
  truncated: true,
  cross_check: null,
}

async function open(view: EvidenceView, aria: string) {
  vi.mocked(api.getFinancials).mockResolvedValue(makeView())
  vi.mocked(api.latestEvaluation).mockResolvedValue({ run: null })
  vi.mocked(api.getEvidence).mockResolvedValue(view)
  const { el } = await renderWithQuery(<FinancialsPage caseId='C1' />, {})
  const figure = el.querySelector<HTMLButtonElement>(`button[aria-label="${aria}"]`)!
  figure.focus()
  await click(figure)
  const sheet = () => document.querySelector<HTMLElement>('[data-slot="sheet-content"]')
  await waitFor(() => !!sheet()?.querySelector('[data-average], p'))
  return { figure, sheet: sheet()! }
}
afterEach(cleanup)

describe('EvidenceSheet', () => {
  it('a Plaid figure opens a right Sheet with monthly subtotals and the average; closing returns focus', async () => {
    const { figure, sheet } = await open(BANK, '$12.50, show where Interest, dividends and royalties comes from')
    expect(api.getEvidence).toHaveBeenCalledWith('C1', 'interest_dividends_royalties', P3)
    expect(sheet.querySelector('[data-slot="sheet-title"]')?.textContent).toBe('Interest, dividends and royalties')
    const months = [...sheet.querySelectorAll('[data-month]')].map((r) => r.textContent)
    expect(months).toEqual(['Subtotal Jul 2026$12.50', 'Subtotal Aug 2026$12.50', 'Subtotal Sep 2026$12.50'])
    expect(sheet.querySelector('[data-average]')?.textContent).toBe('Monthly average$12.50')
    expect(sheet.textContent).toContain('Window Jul 1, 2026 – Sep 30, 2026 (3 months)')
    expect(sheet.textContent).toContain('Checking ••0000')
    expect(sheet.textContent).toContain('Showing the newest 500 transactions')

    await click(button('Close', sheet)!)
    await waitFor(() => !document.querySelector('[data-slot="sheet-content"]'))
    expect(document.activeElement).toBe(figure)
  })

  it('the confirmed value opens the confirming proposal, or the newest when none is confirmed', async () => {
    await open({ kind: 'none', column: 'pension_income', label: 'Pension income' }, '$0.00, show where Pension income comes from')
    expect(api.getEvidence).toHaveBeenCalledWith('C1', 'pension_income', 'X')
    expect(document.querySelector('[data-slot="sheet-content"]')?.textContent).toContain('No source yet')
  })
})
