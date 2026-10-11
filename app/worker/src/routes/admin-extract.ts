import { Hono } from 'hono'
import { extractCaseDocuments } from '../financials/extract-proposals'
import { staffAuth } from '../middleware/staff-auth'
import { notFound, type AdminApp } from './admin-requests'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// FORM-03 / D-17: staff turn the case's uploaded PDFs into document-source proposals.
export const adminExtractRoute = new Hono<AdminApp>()
  .use('/cases/:id/financials/extract', staffAuth)
  .post('/cases/:id/financials/extract', async (c) => {
    const { staff } = c.var
    const caseId = c.req.param('id')
    // A malformed or foreign case id reads like a missing case (T-07-49).
    if (!UUID.test(caseId)) throw notFound()
    const result = await extractCaseDocuments(c.env, { firmId: staff.firmId, caseId, actorId: staff.userId })
    if (!result) throw notFound()
    return c.json(result)
  })
