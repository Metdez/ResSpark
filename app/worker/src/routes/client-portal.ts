import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { getPortalState, openRequest, upsertClientSession } from '../db/portal'
import { clientSession, requireClientHeader, type ClientCtx } from '../middleware/client-session'
import { allowInWindow } from '../middleware/link-rate-limit'

const noSession = () => new HTTPException(401, { message: 'no_session' })
const badRequest = () => new HTTPException(400, { message: 'bad_request' })
const AGENT_CLASSES = ['phone', 'tablet', 'desktop'] as const
type AgentClass = (typeof AGENT_CLASSES)[number]

// Optional string field: absent/null → null; otherwise a string of at most `max` chars.
function optionalText(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || value.length > max) throw badRequest()
  return value
}

// /api/c/*: the client portal. Identity is c.var.client from the cookie, never the request (D-15).
export const clientPortalRoute = new Hono<{ Bindings: Env; Variables: { client: ClientCtx } }>()
  .use('*', clientSession)
  .get('/state', async (c) => {
    const state = await getPortalState(c.env, c.var.client)
    // a request deleted under the link reads exactly like no link
    if (!state) throw noSession()
    return c.json(state)
  })
  // The only path that marks a request opened (D-10, C2): never a GET, never the exchange.
  .post('/start', requireClientHeader, async (c) => {
    try {
      return c.json({ opened_at: await openRequest(c.env, c.var.client.linkId) })
    } catch (err) {
      if (err instanceof Error && err.message === 'link_inactive') throw noSession()
      throw err
    }
  })
  // D-12: where the client is, for Phase 3's mirror view. Ids in the body are ignored.
  .post('/heartbeat', requireClientHeader, async (c) => {
    const { linkId } = c.var.client
    // shortcut: per-isolate in-memory window, fine for a 30 s cadence; upgrade to a Rate Limiting binding keyed by link
    if (!allowInWindow(`hb:${linkId}`, 10, 60_000)) throw new HTTPException(429, { message: 'rate_limited' })
    const body: unknown = await c.req.json().catch(() => ({}))
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw badRequest()
    const { last_step, last_error, user_agent_class } = body as Record<string, unknown>
    const agentClass = user_agent_class ?? null
    if (agentClass !== null && !AGENT_CLASSES.includes(agentClass as AgentClass)) throw badRequest()
    await upsertClientSession(c.env, {
      link_id: linkId,
      last_step: optionalText(last_step, 64),
      last_error: optionalText(last_error, 200),
      user_agent_class: agentClass as AgentClass | null,
    })
    return c.json({ ok: true })
  })
