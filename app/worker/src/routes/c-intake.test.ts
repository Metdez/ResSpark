import { createMiddleware } from 'hono/factory'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as events from '../db/events'
import * as intake from '../db/intake'
import * as rpc from '../financials/rpc'
import { app } from '../index'
import { _resetRateLimitForTests } from '../middleware/link-rate-limit'

// Unit tests for the client intake routes: db and RPC mocked, requireClientHeader real,
// clientSession sets a fixed session.
vi.mock('../db/intake')
vi.mock('../db/events')
vi.mock('../financials/rpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../financials/rpc')>()),
  upsertProposals: vi.fn(),
}))
vi.mock('../middleware/client-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../middleware/client-session')>()),
  clientSession: createMiddleware(async (c, next) => {
    c.set('client', { linkId: 'L1', requestId: 'R1', firmId: 'F1', expiresAt: '2099-01-01T00:00:00Z', openedAt: null })
    await next()
  }),
}))

const send = vi.fn()
const ENV = { SUPABASE_URL: 'https://unit.supabase.test', SUPABASE_SECRET_KEY: 'unit', JOBS: { send } } as unknown as Env
const H = { 'content-type': 'application/json', 'X-Requested-With': 'ResSpark' }
const put = (body: unknown, headers: Record<string, string> = H) =>
  app.request('/api/c/intake', { method: 'PUT', headers, body: JSON.stringify(body) }, ENV)
const done = (headers: Record<string, string> = H) => app.request('/api/c/intake/done', { method: 'POST', headers }, ENV)
const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code

// every applicable client question answered No / minimum, so Done can pass
const COMPLETE: Record<string, boolean | number> = {
  filing_status_married: false, household_size: 1, age_taxpayer: 40, owns_home: false, rents_home: true,
  is_wage_earner: false, is_self_employed: false, vehicle_count: 0, has_real_property: false,
  has_retirement_accounts: false, has_life_insurance_cash_value: false, has_investment_accounts: false,
  all_returns_filed: true, in_open_bankruptcy: false, dependents_count: 0, filed_bankruptcy_past_7yrs: false,
  in_litigation: false, prior_ia_or_oic_default: false, filed_and_paid_timely_last_5_years: true,
  installment_agreement_last_5_years: false,
}

beforeEach(() => {
  _resetRateLimitForTests()
  vi.mocked(intake.intakeContext).mockResolvedValue({ caseId: 'C1', item: { id: 'I1', status: 'pending' } })
  vi.mocked(intake.listAnswers).mockResolvedValue({})
  vi.mocked(intake.listPrefill).mockResolvedValue({})
  vi.mocked(rpc.upsertProposals).mockResolvedValue({ inserted: 1, kept: 0, superseded: 0 })
  vi.mocked(intake.submitIntake).mockResolvedValue({ item_status: 'submitted', request_status: 'in_progress' })
  vi.mocked(events.logEvent).mockResolvedValue(undefined as never)
})
afterEach(() => vi.clearAllMocks())

describe('GET /api/c/intake', () => {
  it('returns the 23 client questions with UI metadata, answers and prefill', async () => {
    vi.mocked(intake.listPrefill).mockResolvedValue({ is_wage_earner: { value: true, source: 'truv' } })
    const res = await app.request('/api/c/intake', {}, ENV)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { questions: { id: string; control: string }[]; prefill: unknown }
    expect(body.questions).toHaveLength(23)
    expect(body.questions[0]).toMatchObject({ id: 'filing_status_married', control: 'yes_no', prompt: 'Are you married?' })
    expect(body.prefill).toEqual({ is_wage_earner: { value: true, source: 'truv' } })
    expect(intake.intakeContext).toHaveBeenCalledWith(ENV, expect.objectContaining({ requestId: 'R1', firmId: 'F1' }))
  })

  it('404 no_intake_item when the request has no intake item', async () => {
    vi.mocked(intake.intakeContext).mockResolvedValue(null)
    const res = await app.request('/api/c/intake', {}, ENV)
    expect(res.status).toBe(404)
    expect(await code(res)).toBe('no_intake_item')
  })
})

describe('PUT /api/c/intake', () => {
  it('403 without the ResSpark header', async () => {
    const res = await put({ question_id: 'owns_home', value: true }, { 'content-type': 'application/json' })
    expect(res.status).toBe(403)
    expect(rpc.upsertProposals).not.toHaveBeenCalled()
  })

  it.each([
    [{ question_id: 'state_of_residence', value: 'CA' }, 'unknown_question'],
    [{ question_id: 'household_size', value: 0 }, 'bad_value'],
    [{ question_id: 'owns_home', value: 'yes' }, 'bad_value'],
    [{ question_id: 'owns_home' }, 'bad_request'],
    [{ value: true }, 'bad_request'],
  ])('400 for %j', async (body, expected) => {
    const res = await put(body)
    expect(res.status).toBe(400)
    expect(await code(res)).toBe(expected)
    expect(rpc.upsertProposals).not.toHaveBeenCalled()
  })

  it('saves one intake proposal scoped to the question and moves a pending item to in_progress', async () => {
    const res = await put({ question_id: 'household_size', value: 3 })
    expect(res.status).toBe(200)
    expect(rpc.upsertProposals).toHaveBeenCalledWith(ENV, {
      firmId: 'F1',
      caseId: 'C1',
      source: 'intake',
      generatorVersion: 'intake',
      scopeColumns: ['household_size'],
      proposals: [
        {
          canonical_column: 'household_size',
          proposed_value: 3,
          method: 'client_answer',
          reliability: 'C',
          source_refs: [{ kind: 'intake_answer', id: 'I1', label: 'Client answer in the portal' }],
          window_start: null,
          window_end: null,
        },
      ],
      actor: { type: 'client', id: 'L1' },
    })
    expect(intake.markItemInProgress).toHaveBeenCalledWith(ENV, 'I1')
  })

  it('409 item_approved once staff approved the answers', async () => {
    vi.mocked(intake.intakeContext).mockResolvedValue({ caseId: 'C1', item: { id: 'I1', status: 'approved' } })
    const res = await put({ question_id: 'owns_home', value: true })
    expect(res.status).toBe(409)
    expect(rpc.upsertProposals).not.toHaveBeenCalled()
  })

  it('maps a database bad_value to 400', async () => {
    vi.mocked(rpc.upsertProposals).mockRejectedValue(new rpc.FinancialRpcError('bad_value'))
    const res = await put({ question_id: 'owns_home', value: true })
    expect(res.status).toBe(400)
    expect(await code(res)).toBe('bad_value')
  })
})

describe('POST /api/c/intake/done', () => {
  it('403 without the header', async () => {
    expect((await done({})).status).toBe(403)
  })

  it('400 incomplete listing the unanswered applicable questions', async () => {
    vi.mocked(intake.listAnswers).mockResolvedValue({ filing_status_married: true, household_size: 2 })
    const res = await done()
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string }; missing: string[] }
    expect(body.error.code).toBe('incomplete')
    expect(body.missing.slice(0, 2)).toEqual(['filing_joint_offer', 'age_taxpayer'])
    expect(body.missing).not.toContain('household_size')
    expect(intake.submitIntake).not.toHaveBeenCalled()
  })

  it('submits and enqueues financials_propose intake_done', async () => {
    vi.mocked(intake.listAnswers).mockResolvedValue(COMPLETE)
    const res = await done()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ item_status: 'submitted', request_status: 'in_progress' })
    expect(intake.submitIntake).toHaveBeenCalledWith(ENV, { itemId: 'I1', requestId: 'R1', linkId: 'L1' })
    expect(send).toHaveBeenCalledWith({ type: 'financials_propose', ref: 'C1', reason: 'intake_done' })
  })

  it('a queue failure is logged and does not fail Done', async () => {
    vi.mocked(intake.listAnswers).mockResolvedValue(COMPLETE)
    send.mockRejectedValueOnce(new Error('queue down'))
    const res = await done()
    expect(res.status).toBe(200)
    expect(events.logEvent).toHaveBeenCalledWith(ENV, expect.objectContaining({ action: 'financials.enqueue_failed' }))
  })
})
