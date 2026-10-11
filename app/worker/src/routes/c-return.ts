import { Hono } from 'hono'
import { consumeReturnNonce } from '../db/bank'
import { recordConnectionEvent } from '../db/connections'

const NONCE = /^[A-Za-z0-9_-]{16,32}$/

// D-08 / T-04-18: Plaid redirects here on success AND exit, so the nonce only nudges a reconcile;
// connection status is never read or written here. Mounted before GET /c/:token.
export const cReturnRoute = new Hono<{ Bindings: Env }>().get('/return', async (c) => {
  const nonce = c.req.query('nonce')
  if (nonce === undefined) {
    // cloned like the index.ts SPA fallback: ASSETS headers are immutable and clientCsp sets headers
    const res = await c.env.ASSETS.fetch(c.req.raw)
    return new Response(res.body, res)
  }
  if (NONCE.test(nonce)) {
    const id = await consumeReturnNonce(c.env, nonce)
    if (id) {
      await c.env.JOBS.send({ type: 'reconcile', ref: id })
      await recordConnectionEvent(c.env, id, 'connection.returned', {}, { type: 'client' })
    }
  }
  return c.redirect('/c/return', 302)
})
