import { afterEach, describe, expect, it, vi } from 'vitest'
import { button, cleanup, click, renderWithQuery, waitFor } from '@/test-utils/query-render'
import * as api from './api'
import type { RunView, WorksheetExport } from './api'
import { RecommendationRail } from './recommendation-rail'
import { RUN } from './test-fixtures'

vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
// Rendered without a RouterProvider: the typed Link becomes a plain anchor.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, children }: { to: string; params: { requestId: string }; children: React.ReactNode }) => (
    <a href={to.replace('$requestId', params.requestId)}>{children}</a>
  ),
}))
vi.mock('./api', async (orig) => ({
  ...(await orig<typeof import('./api')>()),
  latestEvaluation: vi.fn(),
  runEvaluation: vi.fn(),
  exportWorksheet: vi.fn(),
}))

const NOTE = 'A tax professional must review this result before anything is filed.'
const EXPORTED: WorksheetExport = { document_id: 'd1', file_name: 'w.pdf', pages: 2, request_id: 'r1', already: false }

async function render(run: RunView | null = RUN) {
  vi.mocked(api.latestEvaluation).mockResolvedValue({ run })
  const { el } = await renderWithQuery(<RecommendationRail caseId='C1' />, {})
  return el
}
afterEach(cleanup)

describe('RecommendationRail', () => {
  it('shows the run verbatim with Boxes D, E, F, the NRE lines, the payment math and its context', async () => {
    const el = await render()
    const t = el.textContent ?? ''
    for (const s of [
      'Simple payment plan',
      RUN.path,
      RUN.reason,
      NOTE,
      'Box D',
      '$5,200.00',
      'Box E',
      '$4,100.25',
      'Box F',
      '$1,099.75',
      'Total net realizable equity',
      'Suggested amount$1,234.57',
      '$12,345.67 ÷ 10 months, rounded up to the cent',
      'County: Los Angeles, CA',
      'Household: 2',
      'IRS standards effective Jun 29, 2026',
    ])
      expect(t).toContain(s)
    for (const l of RUN.nre_lines) expect(t).toContain(l.label)
    expect([...el.querySelectorAll('[aria-label="Review flags"] li')].map((li) => li.textContent)).toEqual(['Pay stubs older than 60 days'])
    expect(el.querySelector('[data-rail]')?.className).toContain('lg:sticky')
  })

  it('a non-payment run shows no payment math', async () => {
    const el = await render({ ...RUN, payment_math: null })
    expect(el.textContent).not.toContain('rounded up to the cent')
  })

  it('Run evaluation with missing facts shows Information still needed and no amounts', async () => {
    vi.mocked(api.runEvaluation).mockResolvedValue({
      run: null,
      outcome: { kind: 'information_needed', missing: [{ column: 'household_size', label: 'Household size (including taxpayer)' }], review_flags: [] },
    })
    const el = await render()
    await click(button('Run evaluation', el)!)
    await waitFor(() => (el.textContent ?? '').includes('Information still needed'))
    expect(el.textContent).toContain('Household size (including taxpayer)')
    expect(el.textContent).toContain(NOTE)
    expect(el.textContent).not.toMatch(/\$\d/)
  })

  it('Run evaluation with no standards shows Standards unavailable and no amounts', async () => {
    vi.mocked(api.runEvaluation).mockResolvedValue({ run: null, outcome: { kind: 'standards_unavailable', message: 'Standards unavailable' } })
    const el = await render()
    await click(button('Run evaluation', el)!)
    await waitFor(() => (el.textContent ?? '').includes('Standards unavailable'))
    expect(el.textContent).not.toMatch(/\$\d/)
  })

  it('Export worksheet PDF is disabled without a run', async () => {
    const el = await render(null)
    expect(button('Export worksheet PDF', el)?.disabled).toBe(true)
    expect(el.textContent).toContain(NOTE)
  })

  it('exports the run and points to the request page to push it', async () => {
    vi.mocked(api.exportWorksheet).mockResolvedValue(EXPORTED)
    const el = await render()
    await click(button('Export worksheet PDF', el)!)
    expect(api.exportWorksheet).toHaveBeenCalledWith('C1', 'run1')
    await waitFor(() => (el.textContent ?? '').includes('Worksheet saved'))
    const link = [...el.querySelectorAll('a')].find((a) => a.textContent === 'Push it from the request page')
    expect(link?.getAttribute('href')).toBe('/admin/requests/r1')
  })

  it('an earlier export without a request asks for one', async () => {
    vi.mocked(api.exportWorksheet).mockResolvedValue({ ...EXPORTED, request_id: null, already: true })
    const el = await render()
    await click(button('Export worksheet PDF', el)!)
    await waitFor(() => (el.textContent ?? '').includes('Worksheet saved'))
    expect(el.textContent).toContain('Create a request for this case to push it')
  })
})
