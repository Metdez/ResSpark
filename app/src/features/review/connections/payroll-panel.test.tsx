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
  },
  {
    employer_id: 'E2',
    company_name: null,
    status: 'error',
    pay_stubs: 0,
    w2s: 0,
    income_reports: 0,
    documents: [],
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
    expect([...employer('E1').querySelectorAll('button')].map((b) => b.textContent)).toEqual([
      'Pay stub · stub-1.pdf',
      'W-2 · w2-2025.pdf',
      'Income report · income.pdf',
      '1099 · 1099-NEC.pdf',
    ])
  })

  it('opens a document through the signed-URL route in a new tab', async () => {
    await render()
    await act(async () => (employer('E1').querySelector('button') as HTMLButtonElement).click())
    await act(async () => new Promise((r) => setTimeout(r, 0)))
    expect(reviewApi.documentUrl).toHaveBeenCalledWith('P1', 'inline')
    expect(window.open).toHaveBeenCalledWith('https://s.test/p', '_blank', 'noopener')
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
