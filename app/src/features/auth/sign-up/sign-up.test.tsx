import { afterEach, describe, expect, it, vi } from 'vitest'
import { button, cleanup, click, inputByLabel, postedBody, renderWithQuery, type, waitFor } from '@/test-utils/query-render'
import { SignUp } from '.'

const m = vi.hoisted(() => ({ navigate: vi.fn(), signIn: vi.fn() }))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => m.navigate,
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}))
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }), signInWithPassword: m.signIn } },
}))

const SETTLE = 10_000
const fill = async () => {
  await type(inputByLabel('Your name'), 'Dana Lee')
  await type(inputByLabel('Firm name'), 'Lee Tax')
  await type(inputByLabel('Work email'), 'Dana@Firm.test')
  await type(inputByLabel('Password'), 'long-enough-pw')
}

afterEach(cleanup)

describe('SignUp', () => {
  it('creates the firm account, signs in with the returned email, and opens the dashboard', async () => {
    m.signIn.mockResolvedValue({ error: null })
    const { fetchMock } = await renderWithQuery(<SignUp />, {
      'POST /api/auth/sign-up': { status: 200, body: { ok: true, email: 'dana@firm.test' } },
      'POST /api/admin/session': { status: 200, body: { ok: true } },
    })
    await fill()
    await click(button('Create account')!)
    await waitFor(() => m.navigate.mock.calls.length > 0, SETTLE)
    expect(postedBody(fetchMock, '/api/auth/sign-up')).toEqual({
      name: 'Dana Lee',
      firm_name: 'Lee Tax',
      email: 'Dana@Firm.test',
      password: 'long-enough-pw',
    })
    expect(m.signIn).toHaveBeenCalledWith({ email: 'dana@firm.test', password: 'long-enough-pw' })
    expect(m.navigate).toHaveBeenCalledWith({ to: '/admin', replace: true })
  }, 20_000)

  it('explains an email that already has an account', async () => {
    const { el } = await renderWithQuery(<SignUp />, {
      'POST /api/auth/sign-up': { status: 409, body: { error: { code: 'email_exists', message: 'email_exists' } } },
    })
    await fill()
    await click(button('Create account')!)
    await waitFor(() => el.textContent!.includes('already exists'), SETTLE)
    expect(m.signIn).not.toHaveBeenCalled()
  }, 20_000)

  it('blocks a short password before calling the server', async () => {
    const { el, fetchMock } = await renderWithQuery(<SignUp />, {})
    await fill()
    await type(inputByLabel('Password'), 'short')
    await click(button('Create account')!)
    await waitFor(() => el.textContent!.includes('at least 10 characters'), SETTLE)
    expect(fetchMock).not.toHaveBeenCalled()
  }, 20_000)
})
