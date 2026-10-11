import { createMiddleware } from 'hono/factory'
import { routePath } from 'hono/route'

export const LOG_FIELDS = [
  'request_id',
  'route',
  'method',
  'status',
  'duration_ms',
  'firm_id',
  'actor_id',
  'error_code',
] as const

type StaffVars = {
  requestId: string
  staff?: { userId: string; firmId: string }
  errorCode?: string
}

// Allowlisted JSON logger (D-20, PLAT-08): the only log sink in the Worker. `route` is the
// matched route pattern, never the concrete path, so a /c/<token> URL cannot leak.
export function logger() {
  return createMiddleware<{ Variables: StaffVars }>(async (c, next) => {
    const start = Date.now()
    await next()
    const rec: Record<(typeof LOG_FIELDS)[number], unknown> = {
      request_id: c.get('requestId'),
      route: routePath(c, -1) || '/[unmatched]',
      method: c.req.method,
      status: c.res.status,
      duration_ms: Date.now() - start,
      firm_id: c.get('staff')?.firmId,
      actor_id: c.get('staff')?.userId,
      error_code: c.get('errorCode'),
    }
    // `?? null` keeps every allowlisted key present (JSON.stringify drops undefined)
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(Object.fromEntries(LOG_FIELDS.map((k) => [k, rec[k] ?? null]))))
  })
}
