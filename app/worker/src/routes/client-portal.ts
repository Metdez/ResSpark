import { Hono } from 'hono'
import { clientSession, type ClientCtx } from '../middleware/client-session'

// RED stub: no handlers yet.
export const clientPortalRoute = new Hono<{ Bindings: Env; Variables: { client: ClientCtx } }>().use(
  '*',
  clientSession
)
