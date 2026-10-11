import { Hono, type Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { getConnection, recordConnectionEvent } from '../db/connections'
import {
  firmOwnsRequest,
  getConnectionSummary,
  getFirmConnection,
  listConnectionTransactions,
  listRequestConnections,
} from '../db/connections-ops'
import { NonRetryableError, ProviderError } from '../integrations/provider-error'
import { reconcileConnection } from '../jobs/reconcile'
import { staffAuth, type StaffCtx } from '../middleware/staff-auth'

type App = { Bindings: Env; Variables: { staff: StaffCtx; errorCode?: string } }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fail = (status: 400 | 404 | 502 | 503, code: string) => new HTTPException(status, { message: code })

function idParam(c: Context<App>): string {
  const id = c.req.param('id') ?? ''
  if (!UUID.test(id)) throw fail(400, 'bad_request')
  return id
}

// The 409 body carries the vendor's error code, never the vendor's response text.
function refreshError(c: Context<App>, e: unknown): Response {
  if (e instanceof ProviderError && e.transient) throw fail(502, 'provider_unavailable')
  if (e instanceof NonRetryableError && e.code === 'bank_not_available') throw fail(503, 'provider_not_available')
  if (e instanceof NonRetryableError && e.code === 'connection_not_found') throw fail(404, 'not_found')
  if (e instanceof ProviderError) {
    c.set('errorCode', 'provider_error')
    return c.json({ error: { code: 'provider_error', message: e.code } }, 409)
  }
  throw e
}

// Staff-only, firm-scoped (T-04-07). staffAuth is scoped to these paths, not '*', so it never
// runs for sibling /api/admin routes.
export const adminConnectionsRoute = new Hono<App>()
  .use('/requests/:id/connections', staffAuth)
  .use('/connections/*', staffAuth)
  .get('/requests/:id/connections', async (c) => {
    const id = idParam(c)
    if (!(await firmOwnsRequest(c.env, c.var.staff.firmId, id))) throw fail(404, 'not_found')
    return c.json({ connections: await listRequestConnections(c.env, c.var.staff.firmId, id) })
  })
  // D-04: Refresh never sets a status; it re-reads the provider through reconcileConnection.
  // shortcut: runs the reconcile inline for immediate staff feedback; if a Plaid statements fan-out
  // ever exceeds the request budget, enqueue a 'reconcile' job and return 202 instead.
  .post('/connections/:id/refresh', async (c) => {
    const { staff } = c.var
    const conn = await getFirmConnection(c.env, staff.firmId, idParam(c))
    if (!conn) throw fail(404, 'not_found')
    await recordConnectionEvent(c.env, conn.id, 'connection.refresh_requested', { by: staff.userId }, { type: 'staff', id: staff.userId })
    try {
      await reconcileConnection(c.env, conn.id, { source: 'staff', actorId: staff.userId })
    } catch (e) {
      return refreshError(c, e)
    }
    const fresh = await getConnection(c.env, conn.id)
    if (!fresh) throw fail(404, 'not_found')
    return c.json({ connection: await getConnectionSummary(c.env, fresh) })
  })
  .get('/connections/:id/transactions', async (c) => {
    const id = idParam(c)
    const raw = c.req.query('months')
    const months = raw === undefined ? 6 : raw === '3' ? 3 : raw === '6' ? 6 : null
    if (months === null) throw fail(400, 'bad_request')
    const result = await listConnectionTransactions(c.env, c.var.staff.firmId, id, months, 1000)
    if (!result) throw fail(404, 'not_found')
    return c.json({ months, total: result.total, transactions: result.rows })
  })
