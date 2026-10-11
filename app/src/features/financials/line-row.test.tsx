import { act } from 'react'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { button, cleanup, click, inputByLabel, renderWithQuery, type, waitFor } from '@/test-utils/query-render'
import * as api from './api'
import type { FinancialsView, LineView } from './api'
import { LineRow } from './line-row'
import { line, makeView, P1, P2, proposal } from './test-fixtures'
import { useFinancials } from './use-financials'

vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), decide: vi.fn(), getFinancials: vi.fn() }))

// The page keeps ['financials', caseId] observed, so an invalidation refetches; this stands in for it.
function WithView(props: { line: LineView; view: FinancialsView; standardValue?: number | null; allowedValue?: number | null }) {
  useFinancials('C1')
  return (
    <table>
      <tbody>
        <LineRow caseId='C1' {...props} />
      </tbody>
    </table>
  )
}

async function render(l: LineView, extra: { standardValue?: number | null; allowedValue?: number | null } = {}, view = makeView()) {
  vi.mocked(api.decide).mockResolvedValue({ column: l.column ?? '', action: 'accept' })
  vi.mocked(api.getFinancials).mockResolvedValue(view)
  const { el } = await renderWithQuery(<WithView line={l} view={view} {...extra} />, {})
  return el
}
afterEach(cleanup)

const byAria = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
async function typeNote(text: string) {
  const area = inputByLabel('Note (required)') as unknown as HTMLTextAreaElement
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  await act(async () => {
    setter.call(area, text)
    area.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const MONEY = line({
  column: 'pension_income',
  label: 'Pension income',
  value: 10,
  status: 'confirmed',
  confirmed: { proposal_id: null, source: 'intake', by_name: null, at: null },
})

describe('LineRow', () => {
  it('a proposed line shows the chip, the right-aligned proposal value, its source and Accept', async () => {
    const el = await render(line({ column: 'household_size', kind: 'count', status: 'proposed', proposals: [proposal(P1, 'plaid', 1500)] }))
    expect(el.textContent).toContain('Proposed')
    expect(el.querySelector(`[data-proposal="${P1}"] .tabular-nums`)?.textContent).toBe('1500')
    expect(el.querySelector('[data-value]')?.className).toContain('text-right')
    expect(el.querySelector('[data-value]')?.className).toContain('tabular-nums')
    expect(el.querySelector(`[data-proposal="${P1}"]`)?.textContent).toContain('Plaid')
    await click(button('Accept', el)!)
    expect(api.decide).toHaveBeenCalledWith('C1', 'household_size', { action: 'accept', proposal_id: P1 })
  })

  it('a confirmed intake line reads Confirmed · from Intake', async () => {
    const el = await render({ ...MONEY, value: 0 })
    expect(el.textContent).toContain('Confirmed · from Intake')
    expect(el.querySelector('[data-value]')?.textContent).toBe('$0.00')
  })

  it('an edited line reads Edited by its staff member', async () => {
    const el = await render({ ...MONEY, status: 'edited', confirmed: { proposal_id: null, source: 'staff', by_name: 'Test agent', at: null } })
    expect(el.textContent).toContain('Edited by Test agent')
  })

  it('an unknown value reads Needs data, never $0.00', async () => {
    const el = await render(line({ column: 'pension_income' }))
    expect(el.querySelector('[data-value]')?.textContent).toBe('Needs data')
    expect(el.textContent).not.toContain('$0.00')
  })

  it('competing proposals render side by side, each with its own Accept and Reject', async () => {
    const el = await render(
      line({ column: 'gross_wages_taxpayer', label: 'Gross wages', status: 'proposed', proposals: [proposal(P1, 'plaid', 1500), proposal(P2, 'intake', 1400)] })
    )
    expect(el.querySelector(`[data-proposal="${P1}"]`)?.textContent).toContain('$1,500.00')
    expect(el.querySelector(`[data-proposal="${P2}"]`)?.textContent).toContain('$1,400.00')
    await click(byAria('Accept Intake value for Gross wages')!)
    expect(api.decide).toHaveBeenCalledWith('C1', 'gross_wages_taxpayer', { action: 'accept', proposal_id: P2 })
    await click(byAria('Reject Plaid value for Gross wages')!)
    expect(api.decide).toHaveBeenLastCalledWith('C1', 'gross_wages_taxpayer', { action: 'reject', proposal_id: P1 })
  })

  it('Edit needs a valid value and a note, then sends edit with the first proposal id', async () => {
    await render(line({ column: 'gross_wages_taxpayer', label: 'Gross wages', status: 'proposed', proposals: [proposal(P1, 'plaid', 1500)] }))
    await click(button('Edit')!)
    const save = () => button('Save')!
    expect(save().disabled).toBe(true)
    await type(inputByLabel('Value'), '1,250.505')
    await typeNote('Per the March stub')
    expect(document.body.textContent).toContain('Enter a dollar amount with up to 2 decimals.')
    expect(save().disabled).toBe(true)
    await type(inputByLabel('Value'), '$1,250.50')
    expect(save().disabled).toBe(false)
    await click(save())
    expect(api.decide).toHaveBeenCalledWith('C1', 'gross_wages_taxpayer', {
      action: 'edit',
      value: 1250.5,
      note: 'Per the March stub',
      proposal_id: P1,
    })
    await waitFor(() => button('Save') === undefined)
  })

  it('Known $0 is offered on money and count lines only and sends known_zero; Unknown sends unknown', async () => {
    await render(MONEY)
    await click(button('Known $0')!)
    expect(api.decide).toHaveBeenCalledWith('C1', 'pension_income', { action: 'known_zero' })
    await click(button('Unknown')!)
    expect(api.decide).toHaveBeenLastCalledWith('C1', 'pension_income', { action: 'unknown' })
    cleanup()
    await render(line({ column: 'owns_home', kind: 'bool', value: true, status: 'confirmed' }))
    expect(button('Known $0')).toBeUndefined()
  })

  it('Not applicable follows the view: spouse lines when not married, rents_home when owning, pay_frequency when not a wage earner', async () => {
    const age = line({ column: 'age_spouse', section: 'household', label: 'Spouse age', kind: 'count', na_rule: 'not_married' })
    await render(age)
    expect(button('Not applicable')).toBeDefined()
    cleanup()
    await render(age, {}, makeView({ filing_status_married: { value: true } }))
    expect(button('Not applicable')).toBeUndefined()
    cleanup()
    const rents = line({ column: 'rents_home', section: 'household', label: 'Rents home', kind: 'bool', na_rule: 'owns_home' })
    await render(rents)
    expect(button('Not applicable')).toBeUndefined()
    cleanup()
    await render(rents, {}, makeView({ owns_home: { value: true } }))
    expect(button('Not applicable')).toBeDefined()
    cleanup()
    await render(
      line({ column: 'pay_frequency', section: 'employment', label: 'Pay frequency', kind: 'text', na_rule: 'not_wage_earner' }),
      {},
      makeView({ is_wage_earner: { value: false } })
    )
    await click(button('Not applicable')!)
    expect(button('Save')!.disabled).toBe(true)
    await typeNote('Retired; no wages')
    await click(button('Save')!)
    expect(api.decide).toHaveBeenCalledWith('C1', 'pay_frequency', { action: 'not_applicable', note: 'Retired; no wages' })
  })

  it('a 409 proposal_stale toasts and refetches the view', async () => {
    await render(line({ column: 'household_size', kind: 'count', status: 'proposed', proposals: [proposal(P1, 'plaid', 3)] }))
    const before = vi.mocked(api.getFinancials).mock.calls.length
    vi.mocked(api.decide).mockRejectedValueOnce(new ApiError(409, 'proposal_stale', 'stale'))
    await click(button('Accept')!)
    expect(toast.error).toHaveBeenCalledWith('This value changed. The list is refreshed.')
    await waitFor(() => vi.mocked(api.getFinancials).mock.calls.length > before)
  })

  it('expense rows show Actual, IRS standard and Allowed from props', async () => {
    const el = await render(
      line({ column: 'actual_housing_utilities', section: 'expenses', line: '37', label: 'Housing', value: 2100, status: 'confirmed' }),
      { standardValue: 2300, allowedValue: 1900 }
    )
    const cells = [...el.querySelectorAll('td.text-right')].map((c) => c.textContent)
    expect(cells).toEqual(['$2,100.00', '$2,300.00', '$1,900.00'])
  })
})
