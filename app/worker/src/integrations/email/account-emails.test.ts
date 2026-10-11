import { describe, expect, it, vi } from 'vitest'
import { sendInviteEmail, sendPasswordResetEmail } from './account-emails'

const ENV = { RESEND_API_KEY: 're_x' }
const ok = () => vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ id: 'em_1' }), { status: 200 }))
const sent = (f: ReturnType<typeof ok>) => JSON.parse(String(f.mock.calls[0][1]?.body)) as Record<string, string>

describe('account emails', () => {
  it('reports not_configured without a key and makes no call', async () => {
    const f = ok()
    expect(await sendPasswordResetEmail({}, { to: 'a@b.co', url: 'https://x' }, f)).toEqual({ ok: false, reason: 'not_configured' })
    expect(f).not.toHaveBeenCalled()
  })

  it('invites with the firm and inviter, escaping them in html only', async () => {
    const f = ok()
    const input = { to: 'sam@b.co', firmName: 'Valor <b>Tax</b>', inviterName: 'Dana', url: 'https://x/admin/join?token=t', expiresAt: '2026-10-18T00:00:00Z' }
    expect(await sendInviteEmail(ENV, input, f)).toEqual({ ok: true, id: 'em_1' })
    const body = sent(f)
    expect(body.subject).toBe('Join Valor <b>Tax</b> on ResSpark')
    expect(body.text).toContain('Dana invited you to join Valor <b>Tax</b> on ResSpark.')
    expect(body.text).toContain('https://x/admin/join?token=t')
    expect(body.text).toContain('Oct 18, 2026')
    expect(body.html).toContain('Valor &lt;b&gt;Tax&lt;/b&gt;')
    expect(body.html).toContain('<a href="https://x/admin/join?token=t">')
  })

  it('sends the reset link once in text and as a link in html', async () => {
    const f = ok()
    await sendPasswordResetEmail(ENV, { to: 'a@b.co', url: 'https://x/admin/reset-password?token_hash=h' }, f)
    const body = sent(f)
    expect(body.to).toEqual(['a@b.co'] as unknown as string)
    expect(body.text).toContain('https://x/admin/reset-password?token_hash=h')
    expect(body.html).toContain('<a href="https://x/admin/reset-password?token_hash=h">')
  })
})
