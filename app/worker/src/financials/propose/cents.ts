// Integer-cent money for proposals only (D-09); never imported by engine/. Half-up like Python's ROUND_HALF_UP.
const MONEY = /^-?\d+(\.\d{1,2})?$/

// Exact for at most 2 decimals; anything else throws.
export function toCents(amount: string | number): number {
  const s = String(amount).replace(/[$,\s]/g, '')
  if (!MONEY.test(s)) throw new Error('bad_money')
  const [whole, frac = ''] = s.split('.')
  const sign = whole.startsWith('-') ? -1 : 1
  const cents = sign * (Math.abs(Number(whole)) * 100 + Number((frac + '00').slice(0, 2)))
  if (!Number.isSafeInteger(cents)) throw new Error('bad_money')
  return cents
}

// Integer cents, half away from zero.
export const divHalfUp = (numerator: number, denominator: number): number =>
  Math.sign(numerator) * Math.floor((2 * Math.abs(numerator) + denominator) / (2 * denominator))

export const centsToNumber = (cents: number): number => cents / 100

// "$18,450.00" -> 1845000; blank, unparseable or negative -> null (never a default).
export function parseMoney(text: string | null | undefined): number | null {
  if (typeof text !== 'string' || text.trim() === '') return null
  try {
    const cents = toCents(text)
    return cents < 0 ? null : cents
  } catch {
    return null
  }
}
