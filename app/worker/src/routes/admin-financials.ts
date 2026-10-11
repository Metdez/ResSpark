import { Hono, type Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { logEvent } from '../db/events'
import { loadCountyBlock } from '../financials/county'
import {
  getCaseForFinancials,
  getLatestRun,
  getStandardsVersion,
  listCaseEmployers,
  listProposals,
  saveFinancialsSettings,
  staffDisplayNames,
} from '../financials/db'
import { evaluateForCase, toRunView } from '../financials/evaluate'
import { buildEvidence } from '../financials/evidence'
import { lineFor } from '../financials/lines'
import { type DecideAction, decideValue, FinancialRpcError } from '../financials/rpc'
import { buildFinancialsView, settingsOf } from '../financials/view'
import { staffAuth } from '../middleware/staff-auth'
import { badRequest, notFound, readBody, type AdminApp } from './admin-requests'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ACTIONS: readonly string[] = ['accept', 'edit', 'known_zero', 'unknown', 'reject', 'not_applicable']
const MAX_NOTE = 2000
const MAX_SPOUSE_IDS = 20
const MAX_ID_LENGTH = 100

// Refresh body: window 3|6 and spouse employer ids (strings, deduped); anything else is 400.
function refreshPatch(body: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  const { window_months, spouse_employer_ids: ids } = body
  if (window_months !== undefined) {
    if (window_months !== 3 && window_months !== 6) throw badRequest()
    patch.window_months = window_months
  }
  if (ids !== undefined) {
    const ok = (x: unknown) => typeof x === 'string' && x.length > 0 && x.length <= MAX_ID_LENGTH
    if (!Array.isArray(ids) || ids.length > MAX_SPOUSE_IDS || !ids.every(ok)) throw badRequest()
    patch.spouse_employer_ids = [...new Set(ids)]
  }
  return patch
}

// RAISE tokens of financial_value_decide -> HTTP; anything else falls through to onError's 500.
const RPC_STATUS: Record<string, [400 | 404 | 409, string]> = {
  bad_column: [400, 'bad_column'],
  bad_value: [400, 'bad_value'],
  note_required: [400, 'note_required'],
  bad_action: [400, 'bad_action'],
  case_not_found: [404, 'not_found'],
  proposal_stale: [409, 'proposal_stale'],
}

// A malformed or foreign case id is indistinguishable from a missing case (T-07-15).
function caseIdParam(c: Context<AdminApp>): string {
  const id = c.req.param('id') ?? ''
  if (!UUID.test(id)) throw notFound()
  return id
}

// Names of the staff in `ids`; the caller's own name comes from the verified session.
async function namesFor(c: Context<AdminApp>, ids: Array<string | null>): Promise<Record<string, string>> {
  const { staff } = c.var
  const wanted = [...new Set(ids.filter((x): x is string => typeof x === 'string'))]
  return { [staff.userId]: staff.displayName, ...(await staffDisplayNames(c.env, staff.firmId, wanted)) }
}

export const adminFinancialsRoute = new Hono<AdminApp>()
  .use('/cases/*', staffAuth)
  .get('/cases/:id/financials', async (c) => {
    const { firmId } = c.var.staff
    const found = await getCaseForFinancials(c.env, firmId, caseIdParam(c))
    if (!found) throw notFound()
    const caseId = found.caseRow.id
    const [proposals, standardsVersion, employers] = await Promise.all([
      listProposals(c.env, firmId, caseId),
      getStandardsVersion(c.env),
      listCaseEmployers(c.env, firmId, caseId),
    ])
    const [staffNames, county] = await Promise.all([
      namesFor(c, proposals.map((p) => p.decided_by)),
      loadCountyBlock(c.env, firmId, caseId, proposals),
    ])
    return c.json(
      buildFinancialsView({ caseRow: found.caseRow, row: found.row, proposals, staffNames, standardsVersion, county, employers, now: new Date() })
    )
  })
  .post('/cases/:id/financials/refresh', async (c) => {
    const { staff } = c.var
    const caseId = caseIdParam(c)
    const patch = refreshPatch(await readBody(c))
    const found = await getCaseForFinancials(c.env, staff.firmId, caseId)
    if (!found) throw notFound()
    const merged = { ...found.caseRow.financials_settings, ...patch }
    await saveFinancialsSettings(c.env, staff.firmId, caseId, merged)
    const settings = settingsOf(merged)
    await logEvent(c.env, {
      firm_id: staff.firmId,
      case_id: caseId,
      actor_type: 'staff',
      actor_id: staff.userId,
      action: 'financials.refresh_requested',
      payload: { window_months: settings.window_months, spouse_employers: settings.spouse_employer_ids.length },
    })
    await c.env.JOBS.send({ type: 'financials_propose', ref: caseId, reason: 'refresh' })
    return c.json({ queued: true, settings }, 202)
  })
  .post('/cases/:id/financials/:column/decide', async (c) => {
    const { staff } = c.var
    const caseId = caseIdParam(c)
    const column = c.req.param('column')
    if (!lineFor(column)) throw new HTTPException(400, { message: 'bad_column' })
    const body = await readBody(c)
    const { action, value, proposal_id, note } = body
    if (typeof action !== 'string' || !ACTIONS.includes(action)) throw badRequest()
    if (proposal_id != null && (typeof proposal_id !== 'string' || !UUID.test(proposal_id))) throw badRequest()
    if (note != null && (typeof note !== 'string' || note.length > MAX_NOTE)) throw badRequest()
    try {
      const result = await decideValue(c.env, {
        firmId: staff.firmId,
        caseId,
        column,
        action: action as DecideAction,
        value,
        proposalId: (proposal_id as string | null | undefined) ?? null,
        note: (note as string | null | undefined) ?? null,
        actorId: staff.userId,
      })
      return c.json(result)
    } catch (e) {
      const mapped = e instanceof FinancialRpcError ? RPC_STATUS[e.code] : undefined
      if (!mapped) throw e
      throw new HTTPException(mapped[0], { message: mapped[1] })
    }
  })
  .get('/cases/:id/financials/:column/evidence', async (c) => {
    const { firmId } = c.var.staff
    const caseId = caseIdParam(c)
    const column = c.req.param('column')
    if (!lineFor(column)) throw new HTTPException(400, { message: 'bad_column' })
    const proposalId = c.req.query('proposal_id') ?? null
    if (proposalId !== null && !UUID.test(proposalId)) throw badRequest()
    const view = await buildEvidence(c.env, { firmId, caseId, column, proposalId })
    if (!view) throw notFound()
    return c.json(view)
  })
  .post('/cases/:id/evaluations', async (c) => {
    const { staff } = c.var
    const result = await evaluateForCase(c.env, {
      firmId: staff.firmId,
      caseId: caseIdParam(c),
      actorId: staff.userId,
      actorName: staff.displayName,
    })
    if (!result) throw notFound()
    return c.json(result, result.run ? 201 : 200)
  })
  .get('/cases/:id/evaluations/latest', async (c) => {
    const { firmId } = c.var.staff
    const caseId = caseIdParam(c)
    if (!(await getCaseForFinancials(c.env, firmId, caseId))) throw notFound()
    const row = await getLatestRun(c.env, firmId, caseId)
    if (!row) return c.json({ run: null })
    const createdBy = (row.created_by as string | null) ?? null
    const names = await namesFor(c, [createdBy])
    return c.json({ run: toRunView(row, createdBy ? (names[createdBy] ?? null) : null) })
  })
