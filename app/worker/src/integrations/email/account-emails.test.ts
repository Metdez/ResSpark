import { describe, expect, it, vi } from 'vitest'
import { sendInviteEmail, sendPasswordResetEmail } from './account-emails'

type Sent = { from: string; to: string; subject: string; html: string; text: string }
const binding = () => ({ send: vi.fn(async (_m: Sent) => ({ messageId: 'msg_1' })) })
const envWith = (email = binding()) => ({ EMAIL: email, EMAIL_FROM: 'notifications@valortax.test' })

describe('account emails', () => {
  it('reports not_configured without EMAIL_FROM and sends nothing', async () => {
    const email = binding()
    expect(await sendPasswordResetEmail({ EMAIL: email }, { to: 'a@b.co', url: 'https://x' })).toEqual({
      ok: false,
      reason: 'not_configured',
    })
    expect(email.send).not.toHaveBeenCalled()
  })

  it('invites with the firm and inviter, escaping them in html only', async () => {
    const email = binding()
    const input = { to: 'sam@b.co', firmName: 'Valor <b>Tax</b>', inviterName: 'Dana', url: 'https://x/admin/join?token=t', expiresAt: '2026-10-18T00:00:00Z' }
    expect(await sendInviteEmail(envWith(email), input)).toEqual({ ok: true, id: 'msg_1' })
    const sent = email.send.mock.calls[0][0]
    expect(sent.from).toBe('notifications@valortax.test')
    expect(sent.subject).toBe('Join Valor <b>Tax</b> on ResSpark')
    expect(sent.text).toContain('Dana invited you to join Valor <b>Tax</b> on ResSpark.')
    expect(sent.text).toContain('https://x/admin/join?token=t')
    expect(sent.text).toContain('Oct 18, 2026')
    expect(sent.html).toContain('Valor &lt;b&gt;Tax&lt;/b&gt;')
    expect(sent.html).toContain('<a href="https://x/admin/join?token=t">')
  })

  it('sends the reset link once in text and as a link in html', async () => {
    const email = binding()
    await sendPasswordResetEmail(envWith(email), { to: 'a@b.co', url: 'https://x/admin/reset-password?token_hash=h' })
    const sent = email.send.mock.calls[0][0]
    expect(sent.to).toBe('a@b.co')
    expect(sent.text).toContain('https://x/admin/reset-password?token_hash=h')
    expect(sent.html).toContain('<a href="https://x/admin/reset-password?token_hash=h">')
  })
})
