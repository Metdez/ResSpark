import { Hono, type Context, type MiddlewareHandler } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import {
  CLIENT_QUESTION_IDS,
  QUESTION_BY_ID,
  QUESTION_UI,
  clientQuestionOrder,
  validateClientAnswer,
} from '../../../shared/questions'
import { logEvent } from '../db/events'
import { intakeContext, listAnswers, listPrefill, markItemInProgress, submitIntake } from '../db/intake'
import { FinancialRpcError, upsertProposals } from '../financials/rpc'
import { allowInWindow } from '../middleware/link-rate-limit'
import { clientSession, requireClientHeader, type ClientCtx } from '../middleware/client-session'

type Env_ = { Bindings: Env; Variables: { client: ClientCtx; errorCode?: string } }
type Ctx = Context<Env_>

function fail(c: Ctx, status: ContentfulStatusCode, code: string, message: string, extra: object = {}) {
  c.set('errorCode', code)
  return c.json({ error: { code, message }, ...extra }, status)
}
const noItem = (c: Ctx) => fail(c, 404, 'no_intake_item', 'There are no questions on this request.')

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const QUESTIONS_OUT = CLIENT_QUESTION_IDS.map((id) => ({ ...QUESTION_BY_ID[id], ...QUESTION_UI[id] }))

// Per route, not use('*'): see c-uploads.ts (a '*' would also match clientPortalRoute's paths).
const session_: MiddlewareHandler<Env_> = (c, next) =>
  (c.var.client as ClientCtx | undefined) ? next() : clientSession(c, next)

// D-13 / D-19: one question per screen; every answer is an `intake` proposal, never a case value.
export const cIntakeRoute = new Hono<Env_>()
  .get('/intake', session_, async (c) => {
    const { firmId } = c.var.client
    const ctx = await intakeContext(c.env, c.var.client)
    if (!ctx) return noItem(c)
    const answers = await listAnswers(c.env, firmId, ctx.caseId)
    const prefill = await listPrefill(c.env, firmId, ctx.caseId, answers)
    return c.json({ item: ctx.item, questions: QUESTIONS_OUT, answers, prefill })
  })
  .put('/intake', session_, requireClientHeader, async (c) => {
    const { linkId, firmId } = c.var.client
    if (!allowInWindow('intake:' + linkId, 60, 60_000))
      return fail(c, 429, 'rate_limited', 'Too many tries. Wait a minute and try again.')
    const body: unknown = await c.req.json().catch(() => null)
    if (!isObject(body) || typeof body.question_id !== 'string' || !('value' in body))
      return fail(c, 400, 'bad_request', 'That request was not valid.')
    const questionId = body.question_id
    const value = body.value as boolean | number | string
    const invalid = validateClientAnswer(questionId, value)
    if (invalid) return fail(c, 400, invalid, invalid === 'bad_value' ? 'Check your answer.' : 'Unknown question.')

    const ctx = await intakeContext(c.env, c.var.client)
    if (!ctx) return noItem(c)
    if (ctx.item.status === 'approved') return fail(c, 409, 'item_approved', 'Your agent already approved these answers.')
    try {
      await upsertProposals(c.env, {
        firmId,
        caseId: ctx.caseId,
        source: 'intake',
        generatorVersion: 'intake',
        scopeColumns: [questionId],
        proposals: [
          {
            canonical_column: questionId,
            proposed_value: value,
            method: 'client_answer',
            reliability: 'C',
            source_refs: [{ kind: 'intake_answer', id: ctx.item.id, label: 'Client answer in the portal' }],
            window_start: null,
            window_end: null,
          },
        ],
        actor: { type: 'client', id: linkId },
      })
    } catch (err) {
      if (err instanceof FinancialRpcError && err.code === 'bad_value') return fail(c, 400, 'bad_value', 'Check your answer.')
      throw err
    }
    if (ctx.item.status === 'pending') await markItemInProgress(c.env, ctx.item.id)
    return c.json({ saved: true })
  })
  .post('/intake/done', session_, requireClientHeader, async (c) => {
    const { linkId, firmId, requestId } = c.var.client
    const ctx = await intakeContext(c.env, c.var.client)
    if (!ctx) return noItem(c)
    const answers = await listAnswers(c.env, firmId, ctx.caseId)
    const missing = clientQuestionOrder(answers).filter((id) => !(id in answers))
    if (missing.length) return fail(c, 400, 'incomplete', 'Some questions still need an answer.', { missing })

    let result: Awaited<ReturnType<typeof submitIntake>>
    try {
      result = await submitIntake(c.env, { itemId: ctx.item.id, requestId, linkId })
    } catch (err) {
      if (err instanceof Error && err.message === 'item_not_found') return noItem(c)
      throw err
    }
    // D-07: re-propose with the new answers. A queue failure never fails the client's Done.
    try {
      await c.env.JOBS.send({ type: 'financials_propose', ref: ctx.caseId, reason: 'intake_done' })
    } catch {
      await logEvent(c.env, {
        firm_id: firmId,
        request_id: requestId,
        actor_type: 'system',
        action: 'financials.enqueue_failed',
        payload: { reason: 'intake_done' },
      }).catch(() => {})
    }
    return c.json(result)
  })
