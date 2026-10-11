import type { LineView } from './api'

type Kind = LineView['kind']
type Parsed = { ok: true; value: unknown } | { ok: false; message: string }

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
// Date-only ISO strings ('2026-06-29') are calendar days: format in UTC so no time zone shifts them.
const DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

export const formatMoney = (n: number): string => USD.format(n)
export const formatDay = (iso: string): string => DAY.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`))

// An unknown value is never shown as $0 (D-06).
export function formatValue(kind: Kind, v: unknown): string {
  if (v === null || v === undefined) return 'Needs data'
  if (kind === 'bool' && typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (kind === 'money' && typeof v === 'number') return formatMoney(v)
  if (kind === 'money_list' && Array.isArray(v))
    return v.length === 0 ? 'None' : v.map((x) => (typeof x === 'number' ? formatMoney(x) : String(x))).join(', ')
  return String(v)
}

const MONEY = /^-?\d+(\.\d{1,2})?$/
const AMOUNT = /^\d+(\.\d{1,2})?$/

export function parseInputValue(kind: Kind, raw: string): Parsed {
  const s = raw.trim()
  if (kind === 'money') {
    const clean = s.replace(/[$,\s]/g, '')
    return MONEY.test(clean) ? { ok: true, value: Number(clean) } : { ok: false, message: 'Enter a dollar amount with up to 2 decimals.' }
  }
  if (kind === 'count') return /^\d+$/.test(s) ? { ok: true, value: Number(s) } : { ok: false, message: 'Enter a whole number.' }
  if (kind === 'bool') {
    const v = s.toLowerCase()
    if (v === 'yes' || v === 'true') return { ok: true, value: true }
    if (v === 'no' || v === 'false') return { ok: true, value: false }
    return { ok: false, message: 'Choose Yes or No.' }
  }
  if (kind === 'money_list') {
    // Commas separate amounts here, so a list item cannot use a thousands separator.
    const parts = s === '' ? [] : s.split(',').map((x) => x.trim().replace(/^\$/, ''))
    return parts.every((x) => AMOUNT.test(x))
      ? { ok: true, value: parts.map(Number) }
      : { ok: false, message: 'Enter each amount separated by a comma, with up to 2 decimals and no thousands separators.' }
  }
  return s.length > 0 && s.length <= 200 ? { ok: true, value: s } : { ok: false, message: 'Enter a value.' }
}
