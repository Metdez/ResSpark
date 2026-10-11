import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { getPortalState, openRequest } from '../db/portal'
import { clientSession, requireClientHeader, type ClientCtx } from '../middleware/client-session'

const noSession = () => new HTTPException(401, { message: 'no_session' })

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
