import type { MiddlewareHandler } from 'hono'
// RED stub: pass-through; the GREEN commit implements the limit.
export const _resetRateLimitForTests = () => {}
export const linkRateLimit: MiddlewareHandler = async (_c, next) => next()
