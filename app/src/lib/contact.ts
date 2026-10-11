// Shared by the SPA and the Worker: keep this file pure TypeScript (+ zod), no DOM, no `@/` imports.

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
