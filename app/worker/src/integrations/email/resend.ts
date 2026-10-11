// Best-effort link email through Resend over fetch (D-09). One attempt, never retried; the copy
// names only the agent, the firm, the link, and the expiry (M2: no case or tax-debt detail).

export interface LinkEmailInput {
  to: string
  firmName: string
  agentName: string | null
  url: string
  expiresAt: string
}

export type SendResult = { ok: true; id: string } | { ok: false; reason: 'not_configured' | 'send_failed' }

const RESEND_URL = 'https://api.resend.com/emails'
const DEFAULT_FROM = 'onboarding@resend.dev'
const DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => ESCAPES[ch])

function compose(input: LinkEmailInput) {
  const who = (firm: string, agent: string | null) => (agent ? `${agent} at ${firm}` : firm)
  const expires = DATE.format(new Date(input.expiresAt))
  const lines = (firm: string, agent: string | null, link: string) => [
    `${who(firm, agent)} needs a few things from you.`,
    `Open your link: ${link}`,
    `This link expires on ${expires}.`,
    "If you weren't expecting this, you can ignore it.",
  ]
  const text = lines(input.firmName, input.agentName, input.url)
  const url = escapeHtml(input.url)
  const agent = input.agentName === null ? null : escapeHtml(input.agentName)
  const html = lines(escapeHtml(input.firmName), agent, `<a href="${url}">${url}</a>`)
  return {
    subject: `${input.firmName}: a few things to complete`,
    text: `${text[0]}\n\n${text.slice(1).join('\n')}`,
    html: html.map((l) => `<p>${l}</p>`).join(''),
  }
}

export interface EmailMessage {
  to: string
  subject: string
  text: string
  html: string
}

export type EmailEnv = { RESEND_API_KEY?: string; RESEND_FROM?: string }

// One attempt, never retried. Shared by the link email and the account emails (account-emails.ts).
export async function sendEmail(env: EmailEnv, message: EmailMessage, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  if (!env.RESEND_API_KEY) return { ok: false, reason: 'not_configured' }
  const { to, subject, text, html } = message
  try {
    // JSON body: no header line is built from names or addresses, so no header injection path.
    const res = await fetchImpl(RESEND_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.RESEND_FROM || DEFAULT_FROM, to: [to], subject, html, text }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return { ok: false, reason: 'send_failed' }
    const { id } = (await res.json()) as { id?: unknown }
    return typeof id === 'string' ? { ok: true, id } : { ok: false, reason: 'send_failed' }
  } catch {
    return { ok: false, reason: 'send_failed' }
  }
}

export function sendLinkEmail(env: EmailEnv, input: LinkEmailInput, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  return sendEmail(env, { to: input.to, ...compose(input) }, fetchImpl)
}
