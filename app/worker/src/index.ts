import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { requestId, type RequestIdVariables } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import { queue, type Job } from './jobs/index'
import { logger } from './log/logger'
import { type StaffCtx } from './middleware/staff-auth'
import { adminIntegrationsRoute } from './routes/admin-integrations'
import { adminLookupRoute } from './routes/admin-lookup'
import { adminRequestActionsRoute } from './routes/admin-request-actions'
import { adminRequestsRoute } from './routes/admin-requests'
import { adminSessionRoute } from './routes/admin-session'
import { cUploadsRoute } from './routes/c-uploads'
import { clientLinkRoute } from './routes/client-link'
import { clientPortalRoute } from './routes/client-portal'
import { configRoute } from './routes/config'
import { webhooksRoute } from './routes/webhooks'

export const app = new Hono<{
  Bindings: Env
  Variables: RequestIdVariables & { staff?: StaffCtx; errorCode?: string }
}>()

app.use('*', requestId())
app.use('*', logger())
app.use('/api/*', secureHeaders())
const clientPrivacyHeaders = createMiddleware(async (c, next) => {
  await next()
  // set after next(): a raw asset Response returned by a handler drops headers prepared before it
  c.res.headers.set('Cache-Control', 'no-store')
  c.res.headers.set('X-Robots-Tag', 'noindex')
})
app.use('/c/*', secureHeaders(), clientPrivacyHeaders)
app.use('/api/c/*', clientPrivacyHeaders)

// Envelope { error: { code, message } } with fixed strings only; err.message of unknown errors
// is never serialized (T-01-10).
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    const code = err.message || 'error'
    c.set('errorCode', code)
    return c.json({ error: { code, message: code } }, err.status)
  }
  c.set('errorCode', 'internal')
  return c.json({ error: { code: 'internal', message: 'Something went wrong' } }, 500)
})

app.route('/api/config', configRoute)
app.route('/api/admin/session', adminSessionRoute)
app.route('/api/admin/integrations', adminIntegrationsRoute)
app.route('/api/admin/requests', adminRequestsRoute)
app.route('/api/admin/requests', adminRequestActionsRoute)
// Last of the /api/admin mounts: its '*' staffAuth would otherwise run again on sibling admin routes.
app.route('/api/admin', adminLookupRoute)
app.route('/c', clientLinkRoute)
app.route('/api/c', clientPortalRoute)
app.route('/api/c', cUploadsRoute)
app.route('/api/webhooks', webhooksRoute)

app.notFound(async (c) => {
  // path read for routing only, never logged
  const path = c.req.path
  if (path.startsWith('/api/') || path.startsWith('/webhooks/')) {
    c.set('errorCode', 'not_found')
    return c.json({ error: { code: 'not_found', message: 'Not found' } }, 404)
  }
  // SPA fallback for /c/ and friends; cloned so middleware can set headers on it
  const res = await c.env.ASSETS.fetch(c.req.raw)
  return new Response(res.body, res)
})

export default {
  fetch: app.fetch,
  queue,
  scheduled: async (_c: ScheduledController, _env: Env) => {}, // Phase 2 fills the cron
} satisfies ExportedHandler<Env, Job>
