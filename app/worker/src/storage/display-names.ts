// Human-readable names for provider files: what staff and Logics read (documents.original_filename).
// Storage keys keep the machine names (financials/evidence.ts matches stubs by key suffix, connections-ops
// matches employers by folder), so nothing here touches providerObjectPath. Dates are built from their
// parts, never through Date, so a pay date is never shifted by a timezone.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// Logics is a Windows-facing product: none of these may appear in a file name.
const windowsSafe = (s: string) => s.replace(/[\/:*?"<>|]/g, '')
const monthName = (month: number) => MONTHS[month - 1] ?? String(month).padStart(2, '0')

// '2026-10-12' -> 'October 12, 2026'. Anything that is not YYYY-MM-DD comes back unchanged.
export function longDate(iso: string): string {
  if (!ISO_DATE.test(iso)) return iso
  const [y, m, d] = iso.split('-')
  const month = MONTHS[Number(m) - 1]
  return month ? `${month} ${Number(d)}, ${y}` : iso
}

export const statementDisplayName = (year: number, month: number, mask: string | null): string =>
  windowsSafe(`Bank statement - ${monthName(month)} ${year}${mask ? ` - x${mask}` : ''}.pdf`)

// The check number keeps letters, digits and dashes only.
export function payStubDisplayName(payDate: string | null, check: string | null): string {
  const number = (check ?? '').replace(/[^A-Za-z0-9-]/g, '')
  return windowsSafe(`Pay stub - ${payDate ? longDate(payDate) : 'undated'}${number ? ` - check ${number}` : ''}.pdf`)
}

export const w2DisplayName = (year: string | number): string => windowsSafe(`W-2 - ${year}.pdf`)

export const INCOME_REPORT_DISPLAY_NAME = 'Income report.pdf'
