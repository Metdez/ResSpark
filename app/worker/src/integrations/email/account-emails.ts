import { escapeHtml, sendEmail, type EmailEnv, type SendResult } from './resend'

// Staff-account emails (invite, password reset). Same rules as the link email: plain copy,
// names escaped in HTML and raw in text, one send attempt.

const DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

function message(to: string, subject: string, lines: string[], url: string) {
  const text = lines.map((l) => l.replace('{link}', url)).join('\n\n')
  const link = `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`
  const html = lines.map((l) => `<p>${escapeHtml(l).replace('{link}', link)}</p>`).join('')
  return { to, subject, text, html }
}

export interface InviteEmailInput {
  to: string
  firmName: string
  inviterName: string
  url: string
  expiresAt: string
}

export function sendInviteEmail(env: EmailEnv, input: InviteEmailInput, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  const lines = [
    `${input.inviterName} invited you to join ${input.firmName} on ResSpark.`,
    'Set your password here: {link}',
    `This invite expires on ${DATE.format(new Date(input.expiresAt))}.`,
    "If you weren't expecting this, you can ignore it.",
  ]
  return sendEmail(env, message(input.to, `Join ${input.firmName} on ResSpark`, lines, input.url), fetchImpl)
}

export function sendPasswordResetEmail(
  env: EmailEnv,
  input: { to: string; url: string },
  fetchImpl: typeof fetch = fetch
): Promise<SendResult> {
  const lines = [
    'Someone asked to reset the password for your ResSpark account.',
    'Choose a new password here: {link}',
    'The link works once and expires in one hour.',
    "If you didn't ask for this, you can ignore it; your password stays the same.",
  ]
  return sendEmail(env, message(input.to, 'Reset your ResSpark password', lines, input.url), fetchImpl)
}
