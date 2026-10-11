import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderWithQuery } from '@/test-utils/query-render'
import * as api from './api'
import { FinancialsPage } from './financials-page'
import { makeView } from './test-fixtures'

vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('./api', async (orig) => ({
  ...(await orig<typeof import('./api')>()),
  getFinancials: vi.fn(),
  latestEvaluation: vi.fn(),
  refreshProposals: vi.fn(),
  decide: vi.fn(),
}))

async function render(view = makeView()) {
  vi.mocked(api.getFinancials).mockResolvedValue(view)
  vi.mocked(api.latestEvaluation).mockResolvedValue({ run: null })
  vi.mocked(api.refreshProposals).mockResolvedValue({ queued: true })
  const { el } = await renderWithQuery(<FinancialsPage caseId='C1' />, {})
  return el
}
afterEach(cleanup)

describe('FinancialsPage', () => {
  it('renders the seven sections in D-14 order, each collapsible', async () => {
    const el = await render()
    const titles = [...el.querySelectorAll('[data-section] h2')].map((h) => h.textContent)
    expect(titles).toEqual(['Household', 'Employment', 'Monthly income', 'Monthly expenses', 'Assets', 'Compliance', 'Tax liability'])
    expect(el.querySelectorAll('[data-section] button[aria-expanded="true"]')).toHaveLength(7)
  })
})
