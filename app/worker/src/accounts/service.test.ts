import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { acceptInvite, createFirmWithAdmin, createInvite, findOpenInvite } from '../db/accounts'
import { createAuthUser, deleteAuthUser, recoveryTokenHash, setAppMetadata } from './auth-users'
import { hashInviteToken, newInviteToken } from './input'
import { acceptStaffInvite, inviteStaff, passwordResetUrl, signUpFirm } from './service'

vi.mock('../db/accounts', () => ({
  acceptInvite: vi.fn(),
  createFirmWithAdmin: vi.fn(),
  createInvite: vi.fn(),
  findOpenInvite: vi.fn(),
}))
vi.mock('./auth-users', () => ({
  createAuthUser: vi.fn(),
  deleteAuthUser: vi.fn(),
  recoveryTokenHash: vi.fn(),
  setAppMetadata: vi.fn(),
}))

const env = {} as Env
const INVITE = { id: 'I1', firm_id: 'F1', email: 'sam@firm.test', role: 'staff' as const, expires_at: '2026-10-20T00:00:00Z', firm_name: 'Firm' }

beforeEach(() => {
  vi.mocked(createAuthUser).mockResolvedValue({ ok: true, id: 'U1' })
  vi.mocked(createFirmWithAdmin).mockResolvedValue('F1')
  vi.mocked(findOpenInvite).mockResolvedValue(INVITE)
})
afterEach(() => vi.clearAllMocks())

describe('signUpFirm', () => {
  const input = { email: 'dana@firm.test', password: 'long-enough-pw', name: 'Dana', firmName: 'Dana Tax' }

  it('creates the user, then the firm, then the firm claim', async () => {
    expect(await signUpFirm(env, input)).toEqual({ ok: true, userId: 'U1', firmId: 'F1', email: 'dana@firm.test' })
    expect(createAuthUser).toHaveBeenCalledWith(env, { email: input.email, password: input.password })
    expect(createFirmWithAdmin).toHaveBeenCalledWith(env, 'U1', 'Dana Tax', 'Dana')
    expect(setAppMetadata).toHaveBeenCalledWith(env, 'U1', { firm_id: 'F1', role: 'admin' })
  })

  it('returns email_exists without touching the firm tables', async () => {
    vi.mocked(createAuthUser).mockResolvedValue({ ok: false, reason: 'email_exists' })
    expect(await signUpFirm(env, input)).toEqual({ ok: false, code: 'email_exists' })
    expect(createFirmWithAdmin).not.toHaveBeenCalled()
  })

  it('deletes the new user when the firm write fails', async () => {
    vi.mocked(createFirmWithAdmin).mockRejectedValue(new Error('firm_create_failed'))
    await expect(signUpFirm(env, input)).rejects.toThrow('firm_create_failed')
    expect(deleteAuthUser).toHaveBeenCalledWith(env, 'U1')
  })
})

describe('acceptStaffInvite', () => {
  it('refuses a malformed token before any lookup', async () => {
    expect(await acceptStaffInvite(env, { token: 'nope', name: 'Sam', password: 'long-enough-pw' })).toEqual({
      ok: false,
      code: 'invite_invalid',
    })
    expect(findOpenInvite).not.toHaveBeenCalled()
  })

  it('creates the user with the invite firm and role in app_metadata, then accepts', async () => {
    const token = newInviteToken()
    const result = await acceptStaffInvite(env, { token, name: 'Sam', password: 'long-enough-pw' })
    expect(result).toEqual({ ok: true, userId: 'U1', firmId: 'F1', email: 'sam@firm.test' })
    expect(findOpenInvite).toHaveBeenCalledWith(env, await hashInviteToken(token))
    expect(createAuthUser).toHaveBeenCalledWith(env, {
      email: 'sam@firm.test',
      password: 'long-enough-pw',
      appMetadata: { firm_id: 'F1', role: 'staff' },
    })
    expect(acceptInvite).toHaveBeenCalledWith(env, await hashInviteToken(token), 'U1', 'Sam')
  })

  it('deletes the user and reports invite_invalid when the invite closed meanwhile', async () => {
    vi.mocked(acceptInvite).mockRejectedValue(new Error('invite_invalid'))
    const result = await acceptStaffInvite(env, { token: newInviteToken(), name: 'Sam', password: 'long-enough-pw' })
    expect(result).toEqual({ ok: false, code: 'invite_invalid' })
    expect(deleteAuthUser).toHaveBeenCalledWith(env, 'U1')
  })
})

describe('links', () => {
  it('stores only the token hash and puts the raw token in the join URL', async () => {
    vi.mocked(createInvite).mockResolvedValue({ id: 'I1', expires_at: 'x' })
    const out = await inviteStaff(env, { firmId: 'F1', email: 'a@b.co', role: 'staff', invitedBy: 'U9', origin: 'https://app' })
    const token = new URL(out.url).searchParams.get('token')!
    expect(out.url.startsWith('https://app/admin/join?token=')).toBe(true)
    expect(vi.mocked(createInvite).mock.calls[0][1].tokenHash).toBe(await hashInviteToken(token))
    expect(JSON.stringify(vi.mocked(createInvite).mock.calls[0][1])).not.toContain(token)
  })

  it('builds the reset URL from the recovery token hash, or null for no account', async () => {
    vi.mocked(recoveryTokenHash).mockResolvedValueOnce('abc123').mockResolvedValueOnce(null)
    expect(await passwordResetUrl(env, 'a@b.co', 'https://app')).toBe('https://app/admin/reset-password?token_hash=abc123')
    expect(await passwordResetUrl(env, 'x@b.co', 'https://app')).toBeNull()
  })
})
