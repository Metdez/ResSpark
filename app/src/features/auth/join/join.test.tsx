import { afterEach, describe, expect, it, vi } from 'vitest'
import { button, cleanup, click, inputByLabel, postedBody, renderWithQuery, type, waitFor } from '@/test-utils/query-render'
import { Join } from '.'

const TOKEN = 'a'.repeat(43)
const m = vi.hoisted(() => ({ navigate: vi.fn(), signIn: vi.fn(), search: { token: undefined as string | undefined } }))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => m.navigate,
  useSearch: () => m.search,
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}))
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }), signInWithPassword: m.signIn } },
}))

const SETTLE = 10_000
const INVITE = `GET /api/auth/invite?token=${TOKEN}`

afterEach(cleanup)

describe('Join', () => {
  it('shows the firm and email, accepts, signs in and opens the dashboard', async () => {
    m.search.token = TOKEN
    m.signIn.mockResolvedValue({ error: null })
    const { el, fetchMock } = await renderWithQuery(<Join />, {
      [INVITE]: { status: 200, body: { email: 'sam@firm.test', role: 'staff', firm_name: 'Lee Tax', expires_at: '2026-10-18T00:00:00Z' } },
      'POST /api/auth/accept-invite': { status: 200, body: { ok: true, email: 'sam@firm.test' } },
      'POST /api/admin/session': { status: 200, body: { ok: true } },
    })
    await waitFor(() => el.textContent!.includes('Join Lee Tax'), SETTLE)
    expect(el.textContent).toContain('sam@firm.test')
    await type(inputByLabel('Your name'), 'Sam')
    await type(inputByLabel('Password'), 'long-enough-pw')
    await click(button('Join and sign in')!)
    await waitFor(() => m.navigate.mock.calls.length > 0, SETTLE)
    expect(postedBody(fetchMock, '/api/auth/accept-invite')).toEqual({ token: TOKEN, name: 'Sam', password: 'long-enough-pw' })
    expect(m.signIn).toHaveBeenCalledWith({ email: 'sam@firm.test', password: 'long-enough-pw' })
  }, 20_000)

  it('says the link is no longer valid when the invite is closed', async () => {
    m.search.token = TOKEN
    const { el } = await renderWithQuery(<Join />, {
      [INVITE]: { status: 404, body: { error: { code: 'invite_invalid', message: 'invite_invalid' } } },
    })
    await waitFor(() => el.textContent!.includes('no longer valid'), SETTLE)
    expect(button('Join and sign in')).toBeUndefined()
  }, 20_000)

  it('says the same without a token and makes no call', async () => {
    m.search.token = undefined
    const { el, fetchMock } = await renderWithQuery(<Join />, {})
    expect(el.textContent).toContain('no longer valid')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
