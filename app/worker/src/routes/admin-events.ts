import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { listCaseEvents } from '../db/review'
import { staffAuth } from '../middleware/staff-auth'
import type { AdminApp } from './admin-requests'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_LIMIT = 50

function parseLimit(raw: string | undefined): number {
  const n = Math.trunc(Number(raw))
  if (raw === undefined || !Number.isFinite(n)) return MAX_LIMIT
  return Math.min(MAX_LIMIT, Math.max(1, n))
}

export const adminEventsRoute = new Hono<AdminApp>()
  .use('*', staffAuth)
  .get('/cases/:id/events', async (c) => {
    const caseId = c.req.param('id')
    if (!UUID.test(caseId)) throw new HTTPException(404, { message: 'not_found' })
    const limit = parseLimit(c.req.query('limit'))
    const rawBefore = c.req.query('before')
    let before: string | null = null
    if (rawBefore !== undefined) {
      const t = Date.parse(rawBefore)
      if (Number.isNaN(t)) throw new HTTPException(400, { message: 'bad_request' })
      before = new Date(t).toISOString()
    }
    const events = await listCaseEvents(c.env, c.var.staff.firmId, caseId, before, limit)
    if (!events) throw new HTTPException(404, { message: 'not_found' })
    // Payloads go out as stored: staff-only, our own keys plus rejection notes.
    const next_before = events.length === limit ? events[events.length - 1].created_at : null
    return c.json({ events, next_before })
  })
