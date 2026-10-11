import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { QUESTION_UI, QUESTIONS, clientQuestionOrder } from '../../shared/questions'
import { createAdminClient } from '../src/db/client'
import { upsertProposals } from '../src/financials/rpc'
import { app } from '../src/index'
import { seedPortalItems, type PortalFixture } from './fixtures/portal-items'
import { liveEnvOrSkip } from './fixtures/request'

// FORM-02 against the live project: cookie → GET /api/c/intake → PUT answers (intake proposals) →
// POST done (intake_submit + financials_propose), prefill limits, and the 28-question contract.
// Run with `pnpm -C app run test:live:file worker/test/intake-live.test.ts`.
const live = liveEnvOrSkip()
const { SUPABASE_URL, SUPABASE_SECRET_KEY, CLIENT_LINK_HMAC_KEY } = process.env

type Answer = boolean | number | string
// Deterministic answers: every yes/no is No, so pay_frequency is skipped and rents_home is asked.
const answerFor = (id: string): Answer => {
  const ui = QUESTION_UI[id]
  if (ui.control === 'yes_no') return false
  if (ui.control === 'choice') return ui.options![0].value
  return ui.control === 'number' ? 40 : ui.minimum!
}

describe.skipIf(!live)('client intake (live; needs SUPABASE_URL, SUPABASE_SECRET_KEY, CLIENT_LINK_HMAC_KEY)', () => {
  const send = vi.fn(async () => {})
  const env = { SUPABASE_URL, SUPABASE_SECRET_KEY, CLIENT_LINK_HMAC_KEY, JOBS: { send } } as unknown as Env
  let db: SupabaseClient
  let fx: PortalFixture
  let cookie = ''
  const headers = () => ({ cookie, 'content-type': 'application/json', 'X-Requested-With': 'ResSpark' })
  const get = async () => {
    const res = await app.request('/api/c/intake', { headers: { cookie } }, env)
    expect(res.status).toBe(200)
    return (await res.json()) as {
      item: { id: string; status: string }
      questions: { id: string }[]
      answers: Record<string, Answer>
      prefill: Record<string, { value: Answer; source: string }>
    }
  }
  const put = (question_id: string, value: unknown) =>
    app.request('/api/c/intake', { method: 'PUT', headers: headers(), body: JSON.stringify({ question_id, value }) }, env)
  const done = () => app.request('/api/c/intake/done', { method: 'POST', headers: headers() }, env)
  const itemStatus = async () =>
    (await db.from('request_items').select('status').eq('id', fx.items.intake!).single()).data!.status as string

  beforeAll(async () => {
    db = createAdminClient(env)
    fx = await seedPortalItems(env, { kinds: ['intake'] })
    // proposals live on the fixed portal case; start from none of ours
    await db.from('financial_proposals').delete().eq('case_id', fx.caseId).in('source', ['intake', 'truv', 'logics'])
    const seed = (source: 'truv' | 'logics', column: string, value: Answer) =>
      upsertProposals(env, {
        firmId: fx.firmId,
        caseId: fx.caseId,
        source,
        generatorVersion: 'intake-live',
        scopeColumns: [column],
        proposals: [
          { canonical_column: column, proposed_value: value, method: 'test', reliability: 'A', source_refs: [], window_start: null, window_end: null },
        ],
      })
    await seed('truv', 'is_wage_earner', true)
    await seed('logics', 'total_tax_owed', 12345)
    cookie = await fx.cookie()
  })

  afterAll(async () => {
    if (fx) {
      await db.from('financial_proposals').delete().eq('case_id', fx.caseId).in('source', ['intake', 'truv', 'logics'])
      await fx.cleanup()
    }
  })

  it('GET lists the 23 client questions, a pending item and only the allowed prefill', async () => {
    const body = await get()
    expect(body.questions).toHaveLength(23)
    expect(body.item).toEqual({ id: fx.items.intake, status: 'pending' })
    expect(body.answers).toEqual({})
    expect(body.prefill).toEqual({ is_wage_earner: { value: true, source: 'truv' } })
  })

  it('PUT saves one intake proposal, moves the item to in_progress and resumes on GET', async () => {
    const res = await put('household_size', 3)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ saved: true })
    const rows = (
      await db
        .from('financial_proposals')
        .select('canonical_column, proposed_value, reliability, source_refs, status')
        .eq('case_id', fx.caseId)
        .eq('source', 'intake')
    ).data!
    expect(rows).toEqual([
      {
        canonical_column: 'household_size',
        proposed_value: 3,
        reliability: 'C',
        status: 'proposed',
        source_refs: [{ kind: 'intake_answer', id: fx.items.intake, label: 'Client answer in the portal' }],
      },
    ])
    expect(await itemStatus()).toBe('in_progress')
    expect((await get()).answers).toEqual({ household_size: 3 })
  })

  it('rejects bad values, non-client questions and a missing header', async () => {
    expect((await put('household_size', 0)).status).toBe(400)
    const unknown = await put('total_tax_owed', 100)
    expect(unknown.status).toBe(400)
    expect(((await unknown.json()) as { error: { code: string } }).error.code).toBe('unknown_question')
    const noHeader = await app.request(
      '/api/c/intake',
      { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ question_id: 'owns_home', value: true }) },
      env
    )
    expect(noHeader.status).toBe(403)
  })

  it('Done refuses while a question is open, then submits and enqueues financials_propose', async () => {
    const early = await done()
    expect(early.status).toBe(400)
    const missing = ((await early.json()) as { missing: string[] }).missing
    expect(missing[0]).toBe('filing_status_married')
    expect(missing).not.toContain('household_size')

    const answers: Record<string, Answer> = { household_size: 3 }
    for (let id = clientQuestionOrder(answers).find((q) => !(q in answers)); id; id = clientQuestionOrder(answers).find((q) => !(q in answers))) {
      answers[id] = answerFor(id)
      expect((await put(id, answers[id])).status).toBe(200)
    }
    expect(answers).not.toHaveProperty('pay_frequency')
    expect(answers.rents_home).toBe(false)

    const res = await done()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ item_status: 'submitted' })
    expect(await itemStatus()).toBe('submitted')
    expect(send).toHaveBeenCalledWith({ type: 'financials_propose', ref: fx.caseId, reason: 'intake_done' })
    // answers stay proposals until staff accept them (D-05, D-06)
    const { count } = await db.from('case_financial_data').select('case_id', { count: 'exact', head: true }).eq('case_id', fx.caseId)
    expect(count).toBe(0)
  }, 60_000)

  it('QUESTIONS equals the 28 question_definitions rows', async () => {
    const { data, error } = await db.from('question_definitions').select('question_id, prompt, value_type')
    expect(error).toBeNull()
    const rows = data as { question_id: string; prompt: string; value_type: string }[]
    expect(rows).toHaveLength(28)
    const byId = new Map(rows.map((r) => [r.question_id, r]))
    expect(QUESTIONS.map((q) => byId.get(q.id))).toEqual(
      QUESTIONS.map((q) => ({ question_id: q.id, prompt: q.prompt, value_type: q.type }))
    )
  })
})
