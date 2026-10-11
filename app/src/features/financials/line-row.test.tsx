import { afterEach, describe, expect, it, vi } from 'vitest'
import { button, cleanup, click, renderWithQuery } from '@/test-utils/query-render'
import * as api from './api'
import type { LineView } from './api'
import { LineRow } from './line-row'
import { line, makeView, P1, proposal } from './test-fixtures'

vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), decide: vi.fn(), getFinancials: vi.fn() }))

async function render(l: LineView, extra: { standardValue?: number | null; allowedValue?: number | null } = {}, view = makeView()) {
  vi.mocked(api.decide).mockResolvedValue({ column: l.column ?? '', action: 'accept' })
  vi.mocked(api.getFinancials).mockResolvedValue(view)
  const { el } = await renderWithQuery(
    <table>
      <tbody>
        <LineRow caseId='C1' line={l} view={view} {...extra} />
      </tbody>
    </table>,
    {}
  )
  return el
}
afterEach(cleanup)

describe('LineRow', () => {
  it('a proposed line shows the chip, the right-aligned proposal value, its source and Accept', async () => {
    const el = await render(line({ column: 'household_size', kind: 'count', status: 'proposed', proposals: [proposal(P1, 'plaid', 1500)] }))
    expect(el.textContent).toContain('Proposed')
    const value = el.querySelector(`[data-proposal="${P1}"] .tabular-nums`)
    expect(value?.textContent).toBe('1500')
    expect(el.querySelector('[data-value]')?.className).toContain('text-right')
    expect(el.querySelector('[data-value]')?.className).toContain('tabular-nums')
    expect(el.querySelector(`[data-proposal="${P1}"]`)?.textContent).toContain('Plaid')
    await click(button('Accept', el)!)
    expect(api.decide).toHaveBeenCalledWith('C1', 'household_size', { action: 'accept', proposal_id: P1 })
  })

  it('a confirmed intake line reads Confirmed · from Intake', async () => {
    const el = await render(line({ column: 'pension_income', value: 0, status: 'confirmed', confirmed: { proposal_id: null, source: 'intake', by_name: null, at: null } }))
    expect(el.textContent).toContain('Confirmed · from Intake')
    expect(el.querySelector('[data-value]')?.textContent).toBe('$0.00')
  })

  it('an edited line reads Edited by its staff member', async () => {
    const el = await render(line({ column: 'pension_income', value: 10, status: 'edited', confirmed: { proposal_id: null, source: 'staff', by_name: 'Test agent', at: null } }))
    expect(el.textContent).toContain('Edited by Test agent')
  })

  it('an unknown value reads Needs data, never $0.00', async () => {
    const el = await render(line({ column: 'pension_income' }))
    expect(el.querySelector('[data-value]')?.textContent).toBe('Needs data')
    expect(el.textContent).not.toContain('$0.00')
  })
})
