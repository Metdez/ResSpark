import { afterEach, describe, expect, it, vi } from 'vitest'
import { button, cleanup, click, renderWithQuery } from '@/test-utils/query-render'
import * as api from './api'
import type { CountyBlock, FinancialsView } from './api'
import { FinancialsPage } from './financials-page'
import { makeView, P3 } from './test-fixtures'

vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('./api', async (orig) => ({
  ...(await orig<typeof import('./api')>()),
  getFinancials: vi.fn(),
  latestEvaluation: vi.fn(),
  refreshProposals: vi.fn(),
  decide: vi.fn(),
}))

async function render(view: FinancialsView = makeView()) {
  vi.mocked(api.getFinancials).mockResolvedValue(view)
  vi.mocked(api.latestEvaluation).mockResolvedValue({ run: null })
  vi.mocked(api.refreshProposals).mockResolvedValue({ queued: true })
  vi.mocked(api.decide).mockResolvedValue({ column: 'x', action: 'accept' })
  const { el } = await renderWithQuery(<FinancialsPage caseId='C1' />, {})
  return el
}
afterEach(cleanup)

const county = (over: Partial<CountyBlock>): FinancialsView => ({
  ...makeView(),
  county: { ...makeView().county, state_code: 'CA', county_fips: '06037', smarty_county: 'Los Angeles', address_source: 'smarty', address_verified: true, ...over },
})
const section = (el: HTMLElement, id: string) => el.querySelector(`[data-section="${id}"]`) as HTMLElement

describe('FinancialsPage', () => {
  it('renders the seven sections in D-14 order, each collapsible', async () => {
    const el = await render()
    const titles = [...el.querySelectorAll('[data-section] h2')].map((h) => h.textContent)
    expect(titles).toEqual(['Household', 'Employment', 'Monthly income', 'Monthly expenses', 'Assets', 'Compliance', 'Tax liability'])
    expect(el.querySelectorAll('[data-section] button[aria-expanded="true"]')).toHaveLength(7)
    await click(section(el, 'assets').querySelector('button[aria-expanded]')!)
    expect(section(el, 'assets').querySelector('button[aria-expanded]')?.getAttribute('aria-expanded')).toBe('false')
  })

  it('the header shows progress, the window, and sends window_months: 6 and a plain refresh', async () => {
    const el = await render()
    expect(el.textContent).toContain('12 of 64 required facts confirmed')
    expect(el.textContent).toContain('Jul 1, 2026 – Sep 30, 2026')
    expect(button('3 months', el)?.getAttribute('aria-pressed')).toBe('true')
    await click(button('6 months', el)!)
    expect(api.refreshProposals).toHaveBeenCalledWith('C1', { window_months: 6 })
    await click(button('Refresh proposals', el)!)
    expect(api.refreshProposals).toHaveBeenLastCalledWith('C1', {})
  })

  it('Accept all proposed in this section accepts single-proposal lines only', async () => {
    const el = await render()
    await click(button('Accept all proposed in this section', section(el, 'income'))!)
    expect(api.decide).toHaveBeenCalledTimes(1)
    expect(api.decide).toHaveBeenCalledWith('C1', 'interest_dividends_royalties', { action: 'accept', proposal_id: P3 })
  })

  it('shows each county state, with no county select or text field anywhere', async () => {
    let el = await render()
    expect(section(el, 'household').textContent).toContain("Needs data — waiting for the client's address")
    expect(el.querySelector('select, input, [role="combobox"], [role="listbox"]')).toBeNull()
    cleanup()
    el = await render(county({ status: 'confirmed_address', irs_county: 'Los Angeles County' }))
    const row = el.querySelector('[data-county]')!
    expect(row.textContent).toContain('Los Angeles County (FIPS 06037)')
    expect(row.textContent).toContain('Address')
    cleanup()
    el = await render(county({ status: 'ct_old_county', county_fips: '09001', smarty_county: 'Fairfield' }))
    expect(el.querySelector('[data-county]')?.textContent).toContain('old Connecticut county code (FIPS 09001)')
    expect(el.querySelector('[data-county]')?.textContent).toContain('re-confirm their address')
    cleanup()
    el = await render(county({ status: 'not_in_irs_table' }))
    expect(el.querySelector('[data-county]')?.textContent).toContain('Los Angeles (FIPS 06037) is not in the IRS housing table')
  })

  it('lists employers and assigns one to the spouse with spouse_employer_ids', async () => {
    const view: FinancialsView = {
      ...makeView(),
      employers: [
        { employer_id: 'emp_1', connection_id: 'c1', company_name: 'Acme Corp', status: 'connected', person: 'taxpayer' },
        { employer_id: 'emp_2', connection_id: 'c1', company_name: 'Globex', status: 'connected', person: 'taxpayer' },
      ],
    }
    const el = await render(view)
    const rows = [...el.querySelectorAll('[data-employer]')] as HTMLElement[]
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining('Acme Corp'), expect.stringContaining('Globex')])
    await click(button('Spouse', rows[1])!)
    expect(api.refreshProposals).toHaveBeenCalledWith('C1', { spouse_employer_ids: ['emp_2'] })
  })
})
