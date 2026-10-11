// Field rules shared by sign-up, invite and accept-invite. Each returns null when the value is unusable.

export const PASSWORD_MIN = 10
// bcrypt (Supabase Auth) only reads the first 72 bytes.
export const PASSWORD_MAX = 72

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function parseEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const email = v.trim().toLowerCase()
  return email.length <= 254 && EMAIL.test(email) ? email : null
}

export function parseName(v: unknown, max = 100): string | null {
  if (typeof v !== 'string') return null
  const name = v.trim().replace(/\s+/g, ' ')
  return name.length >= 1 && name.length <= max ? name : null
}

export function parsePassword(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const bytes = new TextEncoder().encode(v).length
  return v.length >= PASSWORD_MIN && bytes <= PASSWORD_MAX ? v : null
}

export function parseRole(v: unknown): 'staff' | 'admin' | null {
  return v === 'staff' || v === 'admin' ? v : null
}

// Invite tokens: 32 random bytes as base64url to the invitee; only the SHA-256 hex is stored.
export const INVITE_TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/

export function newInviteToken(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url')
}

export async function hashInviteToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Buffer.from(digest).toString('hex')
}
