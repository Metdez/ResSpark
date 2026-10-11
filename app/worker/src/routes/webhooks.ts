import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { logEvent } from '../db/events'
import { defaultFirmId, recordWebhook } from '../db/webhook-events'
import { adapters } from '../webhooks/adapters'

// D-01: raw body -> verify -> one ledger row -> enqueue an id -> 200. No vendor call and no
// state change happen here; the queue consumer re-reads the provider. The body is read once
// with c.req.text() and no validator is mounted: re-serialized JSON breaks both signatures.
export const webhooksRoute = new Hono<{ Bindings: Env; Variables: { errorCode?: string } }>().post(
  '/:provider',
  async (c) => {
    const provider = c.req.param('provider')
    // own keys only: adapters['constructor'] must not resolve to Object
    const adapter = Object.hasOwn(adapters, provider) ? adapters[provider] : undefined
    if (!adapter) throw new HTTPException(404, { message: 'not_found' })
    // an unconfigured provider cannot be verified: same answer as a bad signature, no hint
    if (!adapter.configured(c.env)) throw new HTTPException(401, { message: 'invalid_signature' })

    const raw = await c.req.text()
    const verified = await adapter.verify(raw, c.req.raw.headers, c.env)
    if (!verified) {
      await logEvent(c.env, {
        firm_id: await defaultFirmId(c.env),
        actor_type: 'provider',
        actor_id: adapter.id,
        action: 'webhook.rejected',
        payload: { provider: adapter.id },
      })
      throw new HTTPException(401, { message: 'invalid_signature' })
    }

    const id = await recordWebhook(c.env, adapter.id, adapter.eventKey(verified), verified.payload)
    if (id === null) return c.json({ ok: true, duplicate: true })
    await c.env.JOBS.send({ type: 'webhook', provider: adapter.id, ref: id })
    return c.json({ ok: true })
  }
)
