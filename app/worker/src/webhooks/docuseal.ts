import type { WebhookAdapter } from './types'

const enc = new TextEncoder()
const FORM_EVENTS = ['form.viewed', 'form.started', 'form.completed', 'form.declined'] as const

export interface DocusealEvent {
  event_type: (typeof FORM_EVENTS)[number]
  timestamp: string
  data: { id: number; submission_id: number }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

// Only form.* events are routed: data.id is the submitter, data.submission_id the connection's external_id.
export const isDocusealEvent = (v: unknown): v is DocusealEvent =>
  isObj(v) &&
  (FORM_EVENTS as readonly unknown[]).includes(v.event_type) &&
  typeof v.timestamp === 'string' &&
  isObj(v.data) &&
  Number.isInteger(v.data.id) &&
  Number.isInteger(v.data.submission_id)

// docuseal.com/resources/use-webhooks: X-Docuseal-Signature = "<unix ts>.<hex HMAC-SHA256(secret, `${ts}.${raw}`)>",
// rejected when more than 300 s from now. crypto.subtle.verify is constant-time and runs in Workers and Node.
export const docusealAdapter: WebhookAdapter = {
  id: 'docuseal',
  configured: (env) => Boolean(env.DOCUSEAL_WEBHOOK_SECRET),
  async verify(raw, headers, env) {
    const header = headers.get('x-docuseal-signature') ?? ''
    const dot = header.indexOf('.')
    const ts = header.slice(0, dot)
    const hex = header.slice(dot + 1)
    if (dot < 0 || !/^\d+$/.test(ts) || !/^[0-9a-f]{64}$/i.test(hex) || !env.DOCUSEAL_WEBHOOK_SECRET) return null
    if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return null
    const key = await crypto.subtle.importKey('raw', enc.encode(env.DOCUSEAL_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
    const sig = Uint8Array.from(hex.match(/../g)!, (h) => parseInt(h, 16))
    if (!(await crypto.subtle.verify('HMAC', key, sig, enc.encode(`${ts}.${raw}`)))) return null
    let payload: unknown
    try {
      payload = JSON.parse(raw) // only after the signature verifies (D-18)
    } catch {
      return null
    }
    return isDocusealEvent(payload) ? { payload: payload as unknown as Record<string, unknown>, iat: Number(ts) } : null
  },
  eventKey: (v) => {
    const p = v.payload as unknown as DocusealEvent
    return `${p.event_type}:${p.data.id}:${p.timestamp}`
  },
}
