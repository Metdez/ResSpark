import { Hono, type Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { staffAuth } from '../middleware/staff-auth'
import { exportWorksheet, listCaseWorksheets } from '../worksheet/store'
import { notFound, type AdminApp } from './admin-requests'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// A malformed id reads like a missing or foreign one (T-07-15).
function uuidParam(c: Context<AdminApp>, name: string): string {
  const id = c.req.param(name) ?? ''
  if (!UUID.test(id)) throw notFound()
  return id
}

export const adminWorksheetRoute = new Hono<AdminApp>()
  .use('/cases/*', staffAuth)
  // FORM-06 / D-16: render the run once, file it as a case document; a re-export returns the same document.
  .post('/cases/:id/evaluations/:runId/worksheet', async (c) => {
    const { staff } = c.var
    const caseId = uuidParam(c, 'id')
    const runId = uuidParam(c, 'runId')
    let result: Awaited<ReturnType<typeof exportWorksheet>>
    try {
      result = await exportWorksheet(c.env, { firmId: staff.firmId, caseId, runId, actorId: staff.userId })
    } catch (e) {
      if (e instanceof Error && e.message === 'worksheet_in_progress') throw new HTTPException(409, { message: 'worksheet_in_progress' })
      throw e
    }
    if (!result) throw notFound()
    return c.json(result, result.already ? 200 : 201)
  })
  .get('/cases/:id/worksheets', async (c) => {
    const result = await listCaseWorksheets(c.env, c.var.staff.firmId, uuidParam(c, 'id'))
    if (!result) throw notFound()
    return c.json(result)
  })
