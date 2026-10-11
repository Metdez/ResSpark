import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { logEvent } from '../db/events'
import { staffAuth, type StaffCtx } from '../middleware/staff-auth'

const EVENTS = ['signed_in', 'signed_out'] as const
type SessionEvent = (typeof EVENTS)[number]

const isSessionEvent = (v: unknown): v is SessionEvent =>
  typeof v === 'string' && (EVENTS as readonly string[]).includes(v)

// D-16: GET feeds nav-user's display name; POST records sign-in/sign-out through logEvent.
export const adminSessionRoute = new Hono<{ Bindings: Env; Variables: { staff: StaffCtx } }>()
  .use('*', staffAuth)
  .get('/', (c) => {
    const { userId, firmId, role, displayName, email } = c.var.staff
    return c.json({ user_id: userId, firm_id: firmId, role, display_name: displayName, email })
  })
  .post('/', async (c) => {
    const body: unknown = await c.req.json().catch(() => null)
    const event = typeof body === 'object' && body !== null ? (body as { event?: unknown }).event : undefined
    // Thrown so onError sets the envelope and the logged error_code; nothing is written.
    if (!isSessionEvent(event)) throw new HTTPException(400, { message: 'bad_request' })
    const id = await logEvent(c.env, {
      firm_id: c.var.staff.firmId,
      actor_type: 'staff',
      actor_id: c.var.staff.userId,
      action: `staff.${event}`,
    })
    return c.json({ ok: true, event_id: id })
  })
