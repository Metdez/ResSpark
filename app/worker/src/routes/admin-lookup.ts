import { Hono, type Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { normalizePhone } from '../../../src/lib/contact'
import { confirmLogicsCase, getCase } from '../db/cases'
import { listCaseRequests } from '../db/dashboard'
import { getIntegration } from '../db/integrations'
import { LogicsError } from '../integrations/logics/client'
import { resolveLogicsClient } from '../integrations/logics/config'
import { fetchCaseSummary, lookupCases, type LookupType } from '../integrations/logics/lookup'
import { staffAuth, type StaffCtx } from '../middleware/staff-auth'

type AdminApp = { Bindings: Env; Variables: { staff: StaffCtx } }

const TYPES: readonly string[] = ['case_id', 'phone', 'email'] satisfies LookupType[]
const isLookupType = (v: unknown): v is LookupType => typeof v === 'string' && TYPES.includes(v)
const INPUT_ERRORS = ['phone_invalid', 'email_invalid', 'case_id_invalid']
const LOGICS_CASE_ID = /^\d{1,9}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const badRequest = () => new HTTPException(400, { message: 'bad_request' })

// Error kinds become fixed codes; nothing from the request or Logics reaches the response (D-03).
export function toHttp(e: unknown): unknown {
  if (e instanceof LogicsError) {
    if (e.kind === 'not_configured') return new HTTPException(409, { message: 'logics_not_configured' })
    if (e.kind === 'unauthorized') return new HTTPException(502, { message: 'logics_unauthorized' })
    // 403: the key authenticated but lacks a scope (Logics: "Missing required scope: case.read").
    if (e.kind === 'forbidden') return new HTTPException(502, { message: 'logics_forbidden' })
    return new HTTPException(502, { message: 'logics_unreachable' })
  }
  if (e instanceof Error && INPUT_ERRORS.includes(e.message)) return new HTTPException(400, { message: e.message })
  return e
}

async function logicsClient(c: Context<AdminApp>) {
  const row = await getIntegration(c.env, c.var.staff.firmId, 'logics')
  return resolveLogicsClient(c.env, row)
}

const readBody = async (c: Context<AdminApp>): Promise<Record<string, unknown>> => {
  const body: unknown = await c.req.json().catch(() => null)
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
}

export const adminLookupRoute = new Hono<AdminApp>()
  .use('*', staffAuth)
  .post('/lookup', async (c) => {
    const { type, value, last_name } = await readBody(c)
    if (!isLookupType(type) || typeof value !== 'string' || value.trim() === '') throw badRequest()
    if (last_name !== undefined && typeof last_name !== 'string') throw badRequest()
    try {
      const { client, mode } = await logicsClient(c)
      const results = await lookupCases(client, { type, value, last_name })
      return c.json({ results, mode })
    } catch (e) {
      throw toHttp(e)
    }
  })
  // C8: the case is re-read from Logics by the chosen id; only search_type is taken from the body.
  .post('/cases/:logicsCaseId/confirm', async (c) => {
    const idParam = c.req.param('logicsCaseId')
    const { search_type } = await readBody(c)
    if (!LOGICS_CASE_ID.test(idParam) || !isLookupType(search_type)) throw badRequest()
    let summary
    try {
      const { client } = await logicsClient(c)
      summary = await fetchCaseSummary(client, Number.parseInt(idParam, 10))
    } catch (e) {
      throw toHttp(e)
    }
    if (!summary) throw new HTTPException(404, { message: 'case_not_found' })
    // Cell first: the documented contact field order.
    const phone = summary.cell_phone ?? summary.home_phone ?? summary.work_phone ?? ''
    const phone_e164 = normalizePhone(phone)?.e164 ?? null
    const { staff } = c.var
    const case_id = await confirmLogicsCase(c.env, {
      firm_id: staff.firmId,
      summary,
      phone_e164,
      actor_id: staff.userId,
      search_type,
    })
    const { logics_case_id, first_name, last_name, email } = summary
    return c.json({ case_id, logics_case_id, first_name, last_name, email, phone_e164 })
  })
  .get('/cases/:id', async (c) => {
    const id = c.req.param('id')
    if (!UUID.test(id)) throw badRequest()
    const row = await getCase(c.env, c.var.staff.firmId, id)
    // Another firm's case is indistinguishable from a missing one (404, not 403).
    if (!row) throw new HTTPException(404, { message: 'not_found' })
    const { logics_case_id, first_name, last_name, email, phone_e164, logics_fetched_at } = row
    // Oct 12 call (I): the builder warns about these; a second packet stays allowed (see admin-requests.ts).
    const requests = await listCaseRequests(c.env, c.var.staff.firmId, id)
    return c.json({
      case_id: row.id,
      logics_case_id,
      first_name,
      last_name,
      email,
      phone_e164,
      logics_fetched_at,
      requests,
    })
  })
