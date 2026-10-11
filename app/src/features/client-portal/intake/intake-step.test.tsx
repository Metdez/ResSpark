import { QueryClient } from '@tanstack/react-query'
import { button, cleanup, click, renderWithQuery, type Reply, waitFor } from '@/test-utils/query-render'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PortalStep } from '../portal-api'
import { IntakeStep } from './intake-step'

const STEP: PortalStep = { id: 'I1', position: 1, kind: 'intake', label: 'Answer a few questions', required: true, status: 'pending' }
const state = (answers: Record<string, unknown> = {}, prefill: Record<string, unknown> = {}): Reply => ({
  status: 200,
  body: { item: { id: 'I1', status: 'pending' }, answers, prefill },
})
const SAVED: Reply = { status: 200, body: { saved: true } }

const invalidate = vi.spyOn(QueryClient.prototype, 'invalidateQueries')
const text = () => document.body.textContent ?? ''
const question = () => document.querySelector('[data-question]')?.getAttribute('data-question')
const puts = (f: ReturnType<typeof vi.fn>) =>
  f.mock.calls
    .filter(([, init]) => (init as RequestInit).method === 'PUT')
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)) as unknown)

async function open(replies: Record<string, Reply>, onClose = () => {}) {
  const r = await renderWithQuery(<IntakeStep step={STEP} open onClose={onClose} />, replies)
  await waitFor(() => question() != null)
  return r.fetchMock
}

afterEach(cleanup)

describe('IntakeStep tracer', () => {
  it('shows the first question with Yes/No; No then Next saves it and moves on', async () => {
    const f = await open({ 'GET /api/c/intake': state(), 'PUT /api/c/intake': SAVED })
    expect(text()).toContain('Are you married?')
    expect(text()).toContain('Question 1 of 20')
    expect(document.querySelector('[role="dialog"]')!.className).toContain('h-dvh')
    await click(button('No')!)
    await click(button('Next')!)
    await waitFor(() => question() === 'household_size')
    expect(puts(f)).toEqual([{ question_id: 'filing_status_married', value: false }])
    expect(text()).toContain('How many people live in your household (incl. you)?')
  })

  it('Done on the last question saves it, finishes and closes', async () => {
    const onClose = vi.fn()
    const answers = {
      filing_status_married: false, household_size: 1, age_taxpayer: 40, owns_home: true, is_wage_earner: false,
      is_self_employed: false, vehicle_count: 0, has_real_property: false, has_retirement_accounts: false,
      has_life_insurance_cash_value: false, has_investment_accounts: false, all_returns_filed: true,
      in_open_bankruptcy: false, dependents_count: 0, filed_bankruptcy_past_7yrs: false, in_litigation: false,
      prior_ia_or_oic_default: false, filed_and_paid_timely_last_5_years: true,
    }
    const f = await open(
      {
        'GET /api/c/intake': state(answers),
        'PUT /api/c/intake': SAVED,
        'POST /api/c/intake/done': { status: 200, body: { item_status: 'submitted', request_status: 'in_progress' } },
      },
      onClose
    )
    expect(question()).toBe('installment_agreement_last_5_years')
    await click(button('No')!)
    await click(button('Done')!)
    await waitFor(() => onClose.mock.calls.length > 0)
    expect(puts(f)).toEqual([{ question_id: 'installment_agreement_last_5_years', value: false }])
    expect(f.mock.calls.some(([p]) => p === '/api/c/intake/done')).toBe(true)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['portal', 'state'] })
  })
})
