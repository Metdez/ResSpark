import { describe, expect, it, vi } from 'vitest'
import { sendLinkEmail, type LinkEmailInput } from './resend'

const ENV = { RESEND_API_KEY: 're_x', RESEND_FROM: 'onboarding@resend.dev' }
const INPUT: LinkEmailInput = {
  to: 'a@example.com',
  firmName: 'Valor <b>Tax</b>',
  agentName: 'Andrew',
  url: 'https://x/c/tok',
  expiresAt: '2026-10-24T00:00:00Z',
}

const stub = (res: () => Promise<Response>) => vi.fn<typeof fetch>(async () => res())
const ok = () => stub(async () => new Response(JSON.stringify({ id: 'em_1' }), { status: 200 }))

type Sent = { from: string; to: string[]; subject: string; html: string; text: string }
const sentBody = (f: ReturnType<typeof stub>) => JSON.parse(String(f.mock.calls[0][1]?.body)) as Sent

describe('sendLinkEmail', () => {
  it('reports not_configured without a key and makes no call', async () => {
    const f = ok()
    expect(await sendLinkEmail({}, INPUT, f)).toEqual({ ok: false, reason: 'not_configured' })
    expect(f).not.toHaveBeenCalled()
  })

  it('posts JSON to Resend with the bearer key and returns the email id', async () => {
    const f = ok()
    expect(await sendLinkEmail(ENV, INPUT, f)).toEqual({ ok: true, id: 'em_1' })
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init?.method).toBe('POST')
    const headers = init?.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer re_x')
    expect(headers['content-type']).toBe('application/json')
    const body = sentBody(f)
    expect(body.from).toBe('onboarding@resend.dev')
    expect(body.to).toEqual(['a@example.com'])
    expect(body.subject).toContain('Valor <b>Tax</b>')
  })

  it('escapes names in the html part and keeps them raw in the text part', async () => {
    const f = ok()
    await sendLinkEmail(ENV, INPUT, f)
    const { html, text } = sentBody(f)
    expect(html).toContain('Valor &lt;b&gt;Tax&lt;/b&gt;')
    expect(html).not.toContain('<b>')
    expect(text).toContain('Valor <b>Tax</b>')
    for (const part of ['Andrew', 'https://x/c/tok', 'Oct 24, 2026']) expect(text).toContain(part)
    expect(html).toContain('<a href="https://x/c/tok">')
  })

  it('carries no tax-debt language, amounts, or case detail', async () => {
    const f = ok()
    await sendLinkEmail(ENV, INPUT, f)
    const { html, text } = sentBody(f)
    for (const part of [html, text]) {
      for (const banned of ['tax debt', 'IRS', '$', 'case']) expect(part).not.toContain(banned)
    }
  })

  it('reports send_failed on a non-2xx answer', async () => {
    const f = stub(async () => new Response('{"message":"bad"}', { status: 422 }))
    expect(await sendLinkEmail(ENV, INPUT, f)).toEqual({ ok: false, reason: 'send_failed' })
  })

  it('reports send_failed on a network error and does not retry', async () => {
    const f = stub(async () => {
      throw new TypeError('network down')
    })
    expect(await sendLinkEmail(ENV, INPUT, f)).toEqual({ ok: false, reason: 'send_failed' })
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('opens with the firm sentence when there is no agent name', async () => {
    const f = ok()
    await sendLinkEmail(ENV, { ...INPUT, agentName: null }, f)
    expect(sentBody(f).text.startsWith('Valor <b>Tax</b> needs a few things from you.')).toBe(true)
  })

  it('falls back to the Resend test sender when RESEND_FROM is empty', async () => {
    const f = ok()
    await sendLinkEmail({ RESEND_API_KEY: 're_x', RESEND_FROM: '' }, INPUT, f)
    expect(sentBody(f).from).toBe('onboarding@resend.dev')
  })
})
