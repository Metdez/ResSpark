import { z } from 'zod'
import { ApiError, api, isObject, isOk } from '@/lib/api'

// Public account endpoints (/api/auth/*) and the sign-in step every account flow ends with.

// Mirrors the Worker rule (worker/src/accounts/input.ts): 10+ characters, at most 72 bytes.
export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .refine((v) => new TextEncoder().encode(v).length <= 72, 'Use at most 72 characters.')

export const emailSchema = z.email({
  error: (iss) =>
    iss.input === '' ? 'Enter your email.' : "That doesn't look like an email address.",
})

export interface InviteInfo {
  email: string
  role: 'staff' | 'admin'
  firm_name: string
  expires_at: string
}

const isEmailOk = (v: unknown): v is { ok: true; email: string } =>
  isOk(v) && typeof (v as { email?: unknown }).email === 'string'

export const isInviteInfo = (v: unknown): v is InviteInfo =>
  isObject(v) &&
  typeof v.email === 'string' &&
  (v.role === 'staff' || v.role === 'admin') &&
  typeof v.firm_name === 'string' &&
  typeof v.expires_at === 'string'

const post = <T>(path: string, body: unknown, guard: (v: unknown) => v is T) =>
  api(path, { method: 'POST', body: JSON.stringify(body) }, guard)

export const signUp = (input: { name: string; firm_name: string; email: string; password: string }) =>
  post('/api/auth/sign-up', input, isEmailOk)

export const getInvite = (token: string) =>
  api(`/api/auth/invite?token=${encodeURIComponent(token)}`, {}, isInviteInfo)

export const acceptInvite = (input: { token: string; name: string; password: string }) =>
  post('/api/auth/accept-invite', input, isEmailOk)

export const requestPasswordReset = (email: string) => post('/api/auth/forgot-password', { email }, isOk)

// Signs in, then records staff.signed_in (D-16). The session already exists if only the event
// post fails, so that failure is swallowed rather than undoing the sign-in.
export async function signInAndRecord(email: string, password: string): Promise<void> {
  const { supabase } = await import('@/lib/supabase')
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error('sign_in_failed')
  await api('/api/admin/session', { method: 'POST', body: JSON.stringify({ event: 'signed_in' }) }, isOk).catch(
    () => undefined
  )
}

// Fixed copy per Worker error code; anything else falls back to the generic line.
const ERRORS: Record<string, string> = {
  email_exists: 'An account with this email already exists. Sign in, or reset your password.',
  weak_password: 'Choose a longer password (at least 10 characters).',
  invalid_email: "That doesn't look like an email address.",
  invalid_name: 'Enter your name.',
  invalid_firm_name: 'Enter your firm name.',
  invite_invalid: 'This invite link is no longer valid. Ask your admin for a new one.',
  rate_limited: 'Too many tries. Wait a minute and try again.',
}

export function accountErrorText(error: unknown): string {
  const code = error instanceof ApiError ? error.code : ''
  return ERRORS[code] ?? "Couldn't reach ResSpark. Check your connection and try again."
}
