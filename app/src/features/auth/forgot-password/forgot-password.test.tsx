import { afterEach, describe, expect, it, vi } from 'vitest'
import { button, cleanup, click, inputByLabel, postedBody, renderWithQuery, type, waitFor } from '@/test-utils/query-render'
import { ForgotPassword } from '.'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }))

afterEach(cleanup)

describe('ForgotPassword', () => {
  it('asks for the link and shows the same answer whether or not the account exists', async () => {
    const { el, fetchMock } = await renderWithQuery(<ForgotPassword />, {
      'POST /api/auth/forgot-password': { status: 200, body: { ok: true } },
    })
    await type(inputByLabel('Email'), 'dana@firm.test')
    await click(button('Send reset link')!)
    await waitFor(() => el.textContent!.includes('Check your email'), 10_000)
    expect(postedBody(fetchMock, '/api/auth/forgot-password')).toEqual({ email: 'dana@firm.test' })
    expect(el.textContent).toContain('If an account exists for dana@firm.test')
    expect(el.textContent).toContain('Settings → Team')
  }, 20_000)
})
