// Best-effort email through Cloudflare Email Service (the `EMAIL` send_email binding). One attempt,
// never retried; the link email names only the agent, the firm, the link, and the expiry (M2).

export interface LinkEmailInput {
  to: string
  firmName: string
  agentName: string | null
  url: string
  expiresAt: string
}

export type SendResult = { ok: true; id: string } | { ok: false; reason: 'not_configured' | 'send_failed' }

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

// The binding is narrowed to the one call used, so tests can pass a plain fake.
export type EmailEnv = {
  EMAIL?: { send(message: EmailMessageBuilder): Promise<EmailSendResult> }
  EMAIL_FROM?: string
}

// The sender domain is not onboarded in Email Service yet: report it like a missing setting.
const NOT_SET_UP = new Set(['E_SENDER_NOT_VERIFIED', 'E_SENDER_DOMAIN_NOT_AVAILABLE'])

// Shared by the link email and the account emails (account-emails.ts).
export async function sendEmail(env: EmailEnv, message: EmailMessage): Promise<SendResult> {
  if (!env.EMAIL || !env.EMAIL_FROM) return { ok: false, reason: 'not_configured' }
  try {
    const { messageId } = await env.EMAIL.send({ from: env.EMAIL_FROM, ...message })
    return { ok: true, id: messageId }
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code
    return { ok: false, reason: typeof code === 'string' && NOT_SET_UP.has(code) ? 'not_configured' : 'send_failed' }
  }
}

export function sendLinkEmail(env: EmailEnv, input: LinkEmailInput): Promise<SendResult> {
  return sendEmail(env, { to: input.to, ...compose(input) })
}
