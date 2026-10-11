// Shared by the SPA and the Worker: keep this file pure TypeScript (+ zod), no DOM, no `@/` imports.
import { z } from 'zod'

export function normalizePhone(
  input: string
): { e164: string; digits: string } | null {
  let digits = input.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1)
  return digits.length === 10 ? { e164: '+1' + digits, digits } : null
}

// The format of the `HomePhone` sample in the Logics doc.
export function formatPhoneDoc(digits: string): string {
  return `(${digits.slice(0, 3)})${digits.slice(3, 6)}-${digits.slice(6)}`
}

export const KNOWN_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
  'aol.com',
  'comcast.net',
] as const

// One insertion, deletion, substitution, or adjacent swap (gmial → gmail) apart.
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  if (a.length === b.length) {
    const swapped =
      a[i] === b[i + 1] &&
      a[i + 1] === b[i] &&
      a.slice(i + 2) === b.slice(i + 2)
    return a.slice(i + 1) === b.slice(i + 1) || swapped
  }
  const [long, short] = a.length > b.length ? [a, b] : [b, a]
  return long.slice(i + 1) === short.slice(i)
}

export function suggestDomain(domain: string): string | null {
  const d = domain.trim().toLowerCase()
  if ((KNOWN_DOMAINS as readonly string[]).includes(d)) return null
  return (
    KNOWN_DOMAINS.find((k) => k.replace('.', '') === d) ??
    KNOWN_DOMAINS.find((k) => withinOneEdit(d, k)) ??
    null
  )
}

export const emailSchema = z.email()

export const contactSchema = z.object({
  email: z.email(),
  phone: z.string().refine((v) => normalizePhone(v) !== null),
})

export interface ContactCheck {
  ok: boolean
  email?: string
  email_error?: string
  phone_error?: string
  email_suggestion?: string
  phone_e164?: string
}

export function checkContact(input: {
  email: string
  phone: string
}): ContactCheck {
  const out: ContactCheck = { ok: false }

  const email = input.email.trim().toLowerCase()
  const at = email.lastIndexOf('@')
  if (email === '') out.email_error = "Enter the client's email."
  else if (!emailSchema.safeParse(email).success)
    out.email_error = "That doesn't look like an email address."
  else out.email = email
  // Also offered alongside a syntax error, so `a@gmailcom` gets `a@gmail.com`.
  const fix = at > 0 ? suggestDomain(email.slice(at + 1)) : null
  if (fix) out.email_suggestion = email.slice(0, at) + '@' + fix

  const phone = normalizePhone(input.phone)
  if (input.phone.trim() === '')
    out.phone_error = "Enter the client's phone number."
  else if (!phone) out.phone_error = 'Enter a 10-digit US phone number.'
  else out.phone_e164 = phone.e164

  // A suggestion blocks too: staff must apply it or explicitly keep the value (D-07).
  out.ok = !out.email_error && !out.email_suggestion && !out.phone_error
  return out
}

export function maskPhone(e164: string): string {
  return '(•••) •••-' + e164.slice(-4)
}

export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  return email.slice(0, 1) + '•••@' + email.slice(at + 1)
}
