import { afterEach, describe, expect, it, vi } from 'vitest'
import { button, cleanup, click, inputByLabel, postedBody, renderWithQuery, type, waitFor } from '@/test-utils/query-render'
import { TeamPage } from './team-page'

vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const SETTLE = 10_000
const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SAM = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const team = (can_manage: boolean) => ({
  members: [
    { user_id: ME, display_name: 'Dana Admin', role: 'admin', email: 'dana@firm.test', last_sign_in_at: '2026-10-10T12:00:00Z', created_at: 't' },
    { user_id: SAM, display_name: 'Sam', role: 'staff', email: 'sam@firm.test', last_sign_in_at: null, created_at: 't' },
  ],
  invites: can_manage ? [{ id: 'I1', email: 'new@firm.test', role: 'staff', created_at: 't', expires_at: '2026-10-18T00:00:00Z' }] : [],
  can_manage,
  you: ME,
})

afterEach(cleanup)

describe('TeamPage', () => {
  it('lists members, pending invites and the invite form for an admin', async () => {
    const { el } = await renderWithQuery(<TeamPage />, { 'GET /api/admin/team': { status: 200, body: team(true) } })
    await waitFor(() => el.textContent!.includes('sam@firm.test'), SETTLE)
    expect(el.textContent).toContain('Dana Admin (you)')
    expect(el.textContent).toContain('Never signed in')
    expect(el.querySelector('[data-invite="I1"]')!.textContent).toContain('new@firm.test')
    expect(el.textContent).toContain('Invite a teammate')
    // no reset link for yourself
    expect(button('Copy reset link', el.querySelector(`[data-member="${ME}"]`)!)).toBeUndefined()
    expect(button('Copy reset link', el.querySelector(`[data-member="${SAM}"]`)!)).toBeDefined()
  }, 20_000)

  it('shows staff the list only', async () => {
    const { el } = await renderWithQuery(<TeamPage />, { 'GET /api/admin/team': { status: 200, body: team(false) } })
    await waitFor(() => el.textContent!.includes('sam@firm.test'), SETTLE)
    expect(el.textContent).not.toContain('Invite a teammate')
    expect(button('Copy reset link')).toBeUndefined()
  }, 20_000)

  it('invites and offers the link when email is not set up', async () => {
    const { el, fetchMock } = await renderWithQuery(<TeamPage />, {
      'GET /api/admin/team': { status: 200, body: team(true) },
      'POST /api/admin/team/invites': {
        status: 200,
        body: { id: 'I2', email: 'lee@firm.test', role: 'staff', expires_at: 'e', url: 'https://x/admin/join?token=t', email_status: 'not_configured' },
      },
    })
    await waitFor(() => el.textContent!.includes('Invite a teammate'), SETTLE)
    await type(inputByLabel('Email'), 'lee@firm.test')
    await click(button('Send invite')!)
    await waitFor(() => el.textContent!.includes('Invite ready for lee@firm.test'), SETTLE)
    expect(postedBody(fetchMock, '/api/admin/team/invites')).toEqual({ email: 'lee@firm.test', role: 'staff' })
    expect(el.textContent).toContain("Email isn't set up yet")
    expect(el.textContent).toContain('https://x/admin/join?token=t')
  }, 20_000)

  it('explains an existing member inline', async () => {
    const { el } = await renderWithQuery(<TeamPage />, {
      'GET /api/admin/team': { status: 200, body: team(true) },
      'POST /api/admin/team/invites': { status: 409, body: { error: { code: 'already_member', message: 'already_member' } } },
    })
    await waitFor(() => el.textContent!.includes('Invite a teammate'), SETTLE)
    await type(inputByLabel('Email'), 'sam@firm.test')
    await click(button('Send invite')!)
    await waitFor(() => el.textContent!.includes('already on your team'), SETTLE)
    expect(toast.error).not.toHaveBeenCalled()
  }, 20_000)
})
