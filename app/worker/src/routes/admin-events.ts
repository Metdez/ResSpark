import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { listCaseEvents, type EventCursor } from '../db/review'
import { staffAuth } from '../middleware/staff-auth'
import type { AdminApp } from './admin-requests'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_LIMIT = 50
// Postgres timestamptz as PostgREST prints it; the strict shape keeps filter syntax out of the or() string.
const TS = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/

function parseLimit(raw: string | undefined): number {
  const n = Math.trunc(Number(raw))
  if (raw === undefined || !Number.isFinite(n)) return MAX_LIMIT
  return Math.min(MAX_LIMIT, Math.max(1, n))
}

// Opaque cursor "<created_at>|<id>"; null means malformed.
export function parseCursor(raw: string): EventCursor | null {
  const [ts, id, extra] = raw.split('|')
  if (extra !== undefined || !TS.test(ts) || Number.isNaN(Date.parse(ts)) || !/^\d{1,18}$/.test(id ?? '')) return null
  return { ts, id: Number(id) }
}

export const adminEventsRoute = new Hono<AdminApp>()
  .use('*', staffAuth)
  .get('/cases/:id/events', async (c) => {
    const caseId = c.req.param('id')
    if (!UUID.test(caseId)) throw new HTTPException(404, { message: 'not_found' })
    const limit = parseLimit(c.req.query('limit'))
    const rawBefore = c.req.query('before')
    let before: EventCursor | null = null
    if (rawBefore !== undefined) {
      before = parseCursor(rawBefore)
      if (!before) throw new HTTPException(400, { message: 'bad_request' })
    }
    const events = await listCaseEvents(c.env, c.var.staff.firmId, caseId, before, limit)
    if (!events) throw new HTTPException(404, { message: 'not_found' })
    // Payloads go out as stored: staff-only, our own keys plus rejection notes.
    const last = events[events.length - 1]
    const next_before = events.length === limit ? `${last.created_at}|${last.id}` : null
    return c.json({ events, next_before })
  })
