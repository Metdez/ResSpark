import { timingSafeEqual } from 'node:crypto'
import type { WebhookAdapter } from './types'

const enc = (s: string) => new TextEncoder().encode(s)
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

// docs.truv.com/docs/webhooks: x-webhook-sign = "v1=" + hex(HMAC-SHA256(Access Secret, raw body)).
export const truvAdapter: WebhookAdapter = {
  id: 'truv',
  configured: (env) => Boolean(env.TRUV_SECRET),
  async verify(raw, headers, env) {
    const sig = headers.get('x-webhook-sign')
    if (!sig?.startsWith('v1=') || !env.TRUV_SECRET) return null
    const key = await crypto.subtle.importKey('raw', enc(env.TRUV_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const expected = 'v1=' + hex(await crypto.subtle.sign('HMAC', key, enc(raw)))
    if (expected.length !== sig.length || !timingSafeEqual(enc(expected), enc(sig))) return null
    let body: unknown
    try {
      body = JSON.parse(raw)
    } catch {
      return null
    }
    const payload = body as Record<string, unknown> | null
    return typeof payload?.webhook_id === 'string' ? { payload } : null
  },
  eventKey: (v) => String(v.payload.webhook_id),
}
