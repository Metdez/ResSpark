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

describe('IntakeStep resume, prefill and errors', () => {
  it('resumes at the first unanswered question', async () => {
    await open({ 'GET /api/c/intake': state({ filing_status_married: false, household_size: 2, age_taxpayer: 50 }) })
    expect(question()).toBe('owns_home')
    expect(text()).toContain('Question 4 of 20')
  })

  it('Truv prefill preselects Yes with the payroll note, and saves only on Next', async () => {
    const answers = { filing_status_married: false, household_size: 2, age_taxpayer: 50, owns_home: true }
    const f = await open({
      'GET /api/c/intake': state(answers, { is_wage_earner: { value: true, source: 'truv' } }),
      'PUT /api/c/intake': SAVED,
    })
    expect(question()).toBe('is_wage_earner')
    expect(text()).toContain('We filled this in from your payroll. Tap to change.')
    expect(button('Yes')!.getAttribute('aria-pressed')).toBe('true')
    expect(puts(f)).toEqual([])
    await click(button('Next')!)
    await waitFor(() => question() === 'is_self_employed')
    expect(puts(f)).toEqual([{ question_id: 'is_wage_earner', value: true }])
  })

  it('tapping a different answer hides the prefill note', async () => {
    await open({ 'GET /api/c/intake': state({}, { filing_status_married: { value: true, source: 'logics' } }) })
    expect(text()).toContain('We filled this in from your case file. Tap to change.')
    await click(button('No')!)
    expect(text()).not.toContain('We filled this in')
  })

  it('a 400 bad_value shows the error and stays on the question', async () => {
    await open({
      'GET /api/c/intake': state(),
      'PUT /api/c/intake': { status: 400, body: { error: { code: 'bad_value' } } },
    })
    await click(button('Yes')!)
    await click(button('Next')!)
    await waitFor(() => document.querySelector('[role="alert"]') != null)
    expect(text()).toContain('Check your answer and try again.')
    expect(question()).toBe('filing_status_married')
  })

  it('Back returns to the previous question without saving', async () => {
    const f = await open({ 'GET /api/c/intake': state({ filing_status_married: false }) })
    expect(question()).toBe('household_size')
    await click(button('Back')!)
    expect(question()).toBe('filing_status_married')
    expect(button('No')!.getAttribute('aria-pressed')).toBe('true')
    expect(puts(f)).toEqual([])
  })
})
