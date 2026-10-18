import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as reviewApi from '../api'
import type { EmployerView } from './api'
import { PayrollPanel } from './payroll-panel'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../api', async (orig) => ({ ...(await orig<typeof import('../api')>()), documentUrl: vi.fn() }))

const EMPLOYERS: EmployerView[] = [
  {
    employer_id: 'E1',
    company_name: 'Acme Corp',
    status: 'done',
    pay_stubs: 2,
    w2s: 1,
    income_reports: 1,
    documents: [
      { id: 'P1', document_type: 'pay_stub', name: 'stub-1.pdf' },
      { id: 'W1', document_type: 'w2', name: 'w2-2025.pdf' },
      { id: 'R1', document_type: 'income_report', name: 'income.pdf' },
      { id: 'F1', document_type: 'form_1099', name: '1099-NEC.pdf' },
    ],
    recent_pay: [
      { pay_date: '2026-09-15', gross_pay: 2000, net_pay: 1500, document_id: 'P1' },
      { pay_date: '2026-08-31', gross_pay: 2000, net_pay: null, document_id: null },
      { pay_date: '2026-08-15', gross_pay: 1950.5, net_pay: 1480.25, document_id: 'P2' },
    ],
  },
  {
    employer_id: 'E2',
    company_name: null,
    status: 'error',
    pay_stubs: 0,
    w2s: 0,
    income_reports: 0,
    documents: [],
    recent_pay: [],
  },
]

let root: Root | undefined
let container: HTMLDivElement

async function render(employers = EMPLOYERS) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root!.render(<PayrollPanel employers={employers} />))
}
const employer = (id: string) => container.querySelector(`[data-employer="${id}"]`) as HTMLElement
const payRows = (id: string) => [...employer(id).querySelectorAll('[data-pay-date]')]
const cells = (row: Element) => [...row.querySelectorAll('td')].map((c) => c.textContent)
const click = async (button: Element | null) => {
  await act(async () => (button as HTMLButtonElement).click())
  await act(async () => new Promise((r) => setTimeout(r, 0)))
}

beforeEach(() => {
  vi.mocked(reviewApi.documentUrl).mockResolvedValue({ url: 'https://s.test/p', expires_in: 300, disposition: 'inline' })
  vi.stubGlobal('open', vi.fn())
})

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('PayrollPanel', () => {
  it('lists employers with names, badges and counts', async () => {
    await render()
    expect(employer('E1').textContent).toContain('Acme Corp')
    expect(employer('E1').textContent).toContain('Done')
    expect(employer('E1').textContent).toContain('2 pay stubs · 1 W-2 · 1 income report')
    expect(employer('E2').textContent).toContain('Employer')
    expect(employer('E2').textContent).toContain('Needs attention')
  })

  it('labels document links by type and name', async () => {
    await render()
    expect([...employer('E1').querySelectorAll('ul button')].map((b) => b.textContent)).toEqual([
      'Pay stub · stub-1.pdf',
      'W-2 · w2-2025.pdf',
      'Income report · income.pdf',
      '1099 · 1099-NEC.pdf',
    ])
  })

  it('opens a document through the signed-URL route in a new tab', async () => {
    await render()
    await click(employer('E1').querySelector('ul button'))
    expect(reviewApi.documentUrl).toHaveBeenCalledWith('P1', 'inline')
    expect(window.open).toHaveBeenCalledWith('https://s.test/p', '_blank', 'noopener')
  })

  it('tabulates the last three months of pay stubs in order with formatted money', async () => {
    await render()
    expect(employer('E1').textContent).toContain('Last 3 months')
    const rows = payRows('E1')
    expect(rows.map((r) => r.getAttribute('data-pay-date'))).toEqual(['2026-09-15', '2026-08-31', '2026-08-15'])
    expect(cells(rows[0])).toEqual(['Sep 15, 2026', '$2,000.00', '$1,500.00', 'Stub'])
    expect(cells(rows[2])).toEqual(['Aug 15, 2026', '$1,950.50', '$1,480.25', 'Stub'])
  })

  it('shows a dash for a missing net amount and no link without a stored stub', async () => {
    await render()
    expect(cells(payRows('E1')[1])).toEqual(['Aug 31, 2026', '$2,000.00', '—', ''])
  })

  it('sums the window into one line, singular for one stub', async () => {
    await render()
    expect(employer('E1').textContent).toContain('3 pay stubs · gross $5,950.50 · net $2,980.25')
    await act(async () => root?.unmount())
    await render([{ ...EMPLOYERS[0], recent_pay: [EMPLOYERS[0].recent_pay[0]] }])
    expect(employer('E1').textContent).toContain('1 pay stub · gross $2,000.00 · net $1,500.00')
  })

  it('a stub link opens that pay stub through the signed-URL route', async () => {
    await render()
    await click(payRows('E1')[2].querySelector('button'))
    expect(reviewApi.documentUrl).toHaveBeenCalledWith('P2', 'inline')
    expect(window.open).toHaveBeenCalledWith('https://s.test/p', '_blank', 'noopener')
  })

  it('an employer with no recent pay shows no table', async () => {
    await render()
    expect(employer('E2').querySelector('table')).toBeNull()
    expect(employer('E2').textContent).not.toContain('Last 3 months')
  })

  it('an employer with no documents reads No documents yet', async () => {
    await render()
    expect(employer('E2').textContent).toContain('No documents yet')
    expect(employer('E2').querySelectorAll('button')).toHaveLength(0)
  })

  it('no employers reads No employers yet', async () => {
    await render([])
    expect(container.textContent).toBe('No employers yet')
  })
})
