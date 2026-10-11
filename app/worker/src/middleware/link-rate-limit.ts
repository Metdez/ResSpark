import { createMiddleware } from 'hono/factory'
import { RATE_LIMITED_HTML } from '../routes/client-link-pages'

const LIMIT = 20
const WINDOW_MS = 60_000
const MAX_KEYS = 10_000

// shortcut: in-memory window is per isolate and resets on redeploy, upgrade when the Rate Limiting binding is confirmed on this plan
const hits = new Map<string, number[]>()

export function _resetRateLimitForTests(): void {
  hits.clear()
}

function limitedInMemory(key: string, now: number): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
  recent.push(now)
  hits.delete(key) // re-insert so Map order stays oldest-first for eviction
  hits.set(key, recent)
  if (hits.size > MAX_KEYS) hits.delete(hits.keys().next().value as string)
  return recent.length > LIMIT
}

// Per-ip throttle on token guessing (D-18). The ip is a counter key only and is never logged.
export const linkRateLimit = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const key = `link:${c.req.header('cf-connecting-ip') ?? 'unknown'}`
  const binding = c.env.LINK_RATE_LIMITER as Env['LINK_RATE_LIMITER'] | undefined
  const limited = binding?.limit
    ? !(await binding.limit({ key })).success
    : limitedInMemory(key, Date.now())
  if (limited) return c.html(RATE_LIMITED_HTML, 429)
  await next()
})
