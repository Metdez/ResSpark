import { afterEach, describe, expect, it, vi } from 'vitest'
import { button, cleanup, click, renderWithQuery, waitFor } from '@/test-utils/query-render'
import * as api from './api'
import type { EvidenceView } from './api'
import { EvidenceSheet } from './evidence-sheet'
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

const base = { column: 'gross_wages_taxpayer', label: 'Gross wages, taxpayer', proposal_id: P3 }
async function sheet(view: EvidenceView, kind: 'money' | 'count' | 'bool' = 'money') {
  vi.mocked(api.getEvidence).mockResolvedValue(view)
  await renderWithQuery(<EvidenceSheet caseId='C1' target={{ column: view.column, proposalId: null }} onClose={() => {}} kind={kind} />, {})
  await waitFor(() => !!document.querySelector('[data-slot="sheet-content"] dl, [data-slot="sheet-content"] table, [data-slot="sheet-content"] ul'))
  return document.querySelector<HTMLElement>('[data-slot="sheet-content"]')!
}
const SIGNED = 'https://x.supabase.co/storage/v1/object/sign/case-documents/a.pdf?token=t'

describe('EvidenceSheet kinds', () => {
  it('payroll: stub rows with a new-tab pay stub link, the formula, the value and the cross-check', async () => {
    const el = await sheet({
      ...base,
      kind: 'payroll',
      window: { start: '2026-07-01', end: '2026-09-30' },
      stubs: [
        { employer: 'Acme Inc', pay_date: '2026-09-18', gross: 2650, frequency: 'biweekly', document_url: SIGNED },
        { employer: 'Beta LLC', pay_date: '2026-09-15', gross: 1800, frequency: 'semimonthly', document_url: null },
      ],
      formula: [{ employer: 'Acme Inc', sum: 7950, stubs: 3, periods_per_year: 26, monthly: 5741.67 }],
      method: 'mean_gross_pay_x_periods_div_12',
      value: 9341.67,
      cross_check: { label: 'Plaid salary deposits (net, cross-check only)', monthly: 6100 },
    })
    const link = el.querySelector<HTMLAnchorElement>('[data-stub="2026-09-18"] a')!
    expect(link.textContent).toBe('Open pay stub')
    expect(link.getAttribute('href')).toBe(SIGNED)
    expect(link.target).toBe('_blank')
    expect(link.rel).toBe('noopener noreferrer')
    expect(el.querySelector('[data-stub="2026-09-15"]')?.textContent).toContain('No PDF')
    expect(el.querySelector('[data-formula]')?.textContent).toBe('Acme Inc: $7,950.00 over 3 stubs × 26 pay periods a year ÷ 12 = $5,741.67 a month')
    expect(el.querySelector('[data-value]')?.textContent).toBe('Proposed value$9,341.67')
    expect(el.querySelector('[data-cross-check]')?.textContent).toBe('Plaid salary deposits (net, cross-check only): $6,100.00 a month')
  })

  it('balances: an account table with the total', async () => {
    const el = await sheet({
      ...base,
      column: 'cash_and_bank_balances',
      kind: 'balances',
      accounts: [{ id: 'a1', account: 'Checking ••0000', type: 'depository', subtype: 'checking', balance_current: 2500, balance_as_of: '2026-10-10T12:00:00Z' }],
      total: 2500,
    })
    expect(el.querySelector('[data-account="a1"]')?.textContent).toContain('Checking ••0000depository · checking$2,500.00Oct 10, 2026')
    expect(el.querySelector('[data-total]')?.textContent).toBe('Total$2,500.00')
  })

  it('intake, Logics, address, staff and documents', async () => {
    let el = await sheet({ ...base, column: 'household_size', kind: 'intake', prompt: 'How many people live in your household?', answer: 3, answered_at: '2026-10-09T15:00:00Z' }, 'count')
    expect(el.querySelector('dl')?.textContent).toBe('QuestionHow many people live in your household?Answer3AnsweredOct 9, 2026')
    cleanup()
    el = await sheet({ ...base, column: 'total_tax_owed', kind: 'logics', field: 'TaxLiability', value: 12345.67, fetched_at: '2026-10-09T15:00:00Z' })
    expect(el.querySelector('dl')?.textContent).toBe('Logics fieldTaxLiabilityValue$12,345.67FetchedOct 9, 2026')
    cleanup()
    el = await sheet({
      ...base,
      column: 'county_of_residence',
      kind: 'address',
      address: { line1: '200 N Spring St', line2: null, city: 'Los Angeles', state_code: 'CA', zip5: '90012' },
      county: 'Los Angeles County',
      fips: '06037',
      source: 'USPS-verified address, county FIPS 06037',
    })
    expect(el.querySelector('dl')?.textContent).toBe('Address200 N Spring St\nLos Angeles, CA 90012CountyLos Angeles CountyFIPS06037SourceUSPS-verified address, county FIPS 06037')
    cleanup()
    el = await sheet({ ...base, column: 'net_rental_income', kind: 'staff', by_name: 'Test agent', at: '2026-10-11T09:00:00Z', note: 'Client has no rental', value: 0 })
    expect(el.querySelector('dl')?.textContent).toBe('Entered byTest agentWhenOct 11, 2026NoteClient has no rentalValue$0.00')
    cleanup()
    el = await sheet({ ...base, kind: 'document', documents: [{ id: 'd1', name: 'w2-2025.pdf', url: SIGNED }] })
    const a = el.querySelector('a')!
    expect([a.textContent, a.rel, a.target]).toEqual(['Open w2-2025.pdf', 'noopener noreferrer', '_blank'])
  })

  it('a guard rejects a non-https document link', () => {
    expect(api.isEvidenceView({ ...base, kind: 'document', documents: [{ id: 'd1', name: 'x', url: 'javascript:alert(1)' }] })).toBe(false)
    expect(api.isEvidenceView({ ...base, kind: 'mystery' })).toBe(false)
  })
})
