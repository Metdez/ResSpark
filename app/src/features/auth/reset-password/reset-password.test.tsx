import { afterEach, describe, expect, it, vi } from 'vitest'
import { button, cleanup, click, inputByLabel, renderWithQuery, type, waitFor } from '@/test-utils/query-render'
import { ResetPassword } from '.'

const m = vi.hoisted(() => ({
  navigate: vi.fn(),
  verifyOtp: vi.fn(),
  updateUser: vi.fn(),
  search: { token_hash: 'hash-1' as string | undefined },
}))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => m.navigate,
  useSearch: () => m.search,
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { verifyOtp: m.verifyOtp, updateUser: m.updateUser } } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const SETTLE = 10_000
const fill = async (password: string, confirm = password) => {
  await type(inputByLabel('New password'), password)
  await type(inputByLabel('Confirm new password'), confirm)
}

afterEach(cleanup)

describe('ResetPassword', () => {
  it('verifies the recovery token on submit, saves the password and opens the dashboard', async () => {
    m.search.token_hash = 'hash-1'
    m.verifyOtp.mockResolvedValue({ error: null })
    m.updateUser.mockResolvedValue({ error: null })
    await renderWithQuery(<ResetPassword />, {})
    expect(m.verifyOtp).not.toHaveBeenCalled()
    await fill('long-enough-pw')
    await click(button('Save new password')!)
    await waitFor(() => m.navigate.mock.calls.length > 0, SETTLE)
    expect(m.verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash-1', type: 'recovery' })
    expect(m.updateUser).toHaveBeenCalledWith({ password: 'long-enough-pw' })
  }, 20_000)

  it('explains an expired or used link and keeps the password unchanged', async () => {
    m.verifyOtp.mockResolvedValue({ error: { message: 'expired' } })
    const { el } = await renderWithQuery(<ResetPassword />, {})
    await fill('long-enough-pw')
    await click(button('Save new password')!)
    await waitFor(() => el.textContent!.includes('expired or was already used'), SETTLE)
    expect(m.updateUser).not.toHaveBeenCalled()
  }, 20_000)

  it('catches mismatched passwords before using the token', async () => {
    const { el } = await renderWithQuery(<ResetPassword />, {})
    await fill('long-enough-pw', 'different-pw-1')
    await click(button('Save new password')!)
    await waitFor(() => el.textContent!.includes("don't match"), SETTLE)
    expect(m.verifyOtp).not.toHaveBeenCalled()
  }, 20_000)

  it('disables the form without a token', async () => {
    m.search.token_hash = undefined
    const { el } = await renderWithQuery(<ResetPassword />, {})
    expect(el.textContent).toContain('expired or was already used')
    expect(button('Save new password')!.disabled).toBe(true)
  })
})
