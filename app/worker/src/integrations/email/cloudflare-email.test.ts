import { describe, expect, it, vi } from 'vitest'
import { sendEmail, sendLinkEmail, type LinkEmailInput } from './cloudflare-email'

const INPUT: LinkEmailInput = {
  to: 'a@example.com',
  firmName: 'Valor <b>Tax</b>',
  agentName: 'Andrew',
  url: 'https://x/c/tok',
  expiresAt: '2026-10-24T00:00:00Z',
}

type Sent = { from: string; to: string; subject: string; html: string; text: string }

// Fake `EMAIL` binding: records the message and answers like Cloudflare Email Service.
const binding = (fail?: unknown) => ({
  send: vi.fn(async (_m: Sent) => {
    if (fail) throw fail
    return { messageId: 'msg_1' }
  }),
})
const envWith = (email = binding()) => ({ EMAIL: email, EMAIL_FROM: 'notifications@valortax.test' })
const coded = (code: string) => Object.assign(new Error('refused'), { code })

describe('sendEmail (Cloudflare Email Service)', () => {
  it('reports not_configured without EMAIL_FROM or without the binding, and sends nothing', async () => {
    const email = binding()
    expect(await sendLinkEmail({ EMAIL: email }, INPUT)).toEqual({ ok: false, reason: 'not_configured' })
    expect(await sendLinkEmail({ EMAIL: email, EMAIL_FROM: '' }, INPUT)).toEqual({ ok: false, reason: 'not_configured' })
    expect(await sendLinkEmail({ EMAIL_FROM: 'notifications@valortax.test' }, INPUT)).toEqual({ ok: false, reason: 'not_configured' })
    expect(email.send).not.toHaveBeenCalled()
  })

  it('sends one message from EMAIL_FROM through the binding and returns its message id', async () => {
    const email = binding()
    expect(await sendLinkEmail(envWith(email), INPUT)).toEqual({ ok: true, id: 'msg_1' })
    expect(email.send).toHaveBeenCalledTimes(1)
    const sent = email.send.mock.calls[0][0]
    expect(sent.from).toBe('notifications@valortax.test')
    expect(sent.to).toBe('a@example.com')
    expect(sent.subject).toContain('Valor <b>Tax</b>')
  })

  it.each(['E_SENDER_NOT_VERIFIED', 'E_SENDER_DOMAIN_NOT_AVAILABLE'])(
    'reports %s (domain not onboarded yet) as not_configured',
    async (code) => {
      expect(await sendLinkEmail(envWith(binding(coded(code))), INPUT)).toEqual({ ok: false, reason: 'not_configured' })
    }
  )

  it('reports send_failed on any other error and does not retry', async () => {
    const email = binding(coded('E_DELIVERY_FAILED'))
    expect(await sendLinkEmail(envWith(email), INPUT)).toEqual({ ok: false, reason: 'send_failed' })
    expect(email.send).toHaveBeenCalledTimes(1)
    expect(await sendEmail(envWith(binding(new TypeError('boom'))), { to: 'a@b.co', subject: 's', text: 't', html: 'h' })).toEqual({
      ok: false,
      reason: 'send_failed',
    })
  })
})

describe('sendLinkEmail copy', () => {
  const sentFor = async (input = INPUT) => {
    const email = binding()
    await sendLinkEmail(envWith(email), input)
    return email.send.mock.calls[0][0]
  }

  it('escapes names in the html part and keeps them raw in the text part', async () => {
    const { html, text } = await sentFor()
    expect(html).toContain('Valor &lt;b&gt;Tax&lt;/b&gt;')
    expect(html).not.toContain('<b>')
    expect(text).toContain('Valor <b>Tax</b>')
    for (const part of ['Andrew', 'https://x/c/tok', 'Oct 24, 2026']) expect(text).toContain(part)
    expect(html).toContain('<a href="https://x/c/tok">')
  })

  it('carries no tax-debt language, amounts, or case detail', async () => {
    const { html, text } = await sentFor()
    for (const part of [html, text]) {
      for (const banned of ['tax debt', 'IRS', '$', 'case']) expect(part).not.toContain(banned)
    }
  })

  it('opens with the firm sentence when there is no agent name', async () => {
    const { text } = await sentFor({ ...INPUT, agentName: null })
    expect(text.startsWith('Valor <b>Tax</b> needs a few things from you.')).toBe(true)
  })
})
