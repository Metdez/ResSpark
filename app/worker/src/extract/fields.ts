// Shared helpers of src/document_parse.py, with Python str and Decimal semantics.

// Python ValueError raised by a template; the message is the Python text verbatim.
export class ExtractError extends Error {}

// A bare next() that found nothing; _parse_document turns it into "No template matched".
export class StopIteration extends Error {}

export type Rows = Array<[number, Array<[number, string]>]>

// Python str.isspace() for the characters a PDF text layer can hold.
const WS = '\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000'
const STRIP = new RegExp(`^[${WS}]+|[${WS}]+$`, 'g')
export const WS_RUN = new RegExp(`[${WS}]+`, 'g')

export const strip = (text: string): string => text.replace(STRIP, '')

// Python str.split() with no separator: split on whitespace runs, drop empty ends.
export const pySplit = (text: string): string[] => strip(text).split(WS_RUN).filter(Boolean)

// repr() of a str, for error messages. shortcut: escapes only what Latin-1 text can hold.
export const pyRepr = (text: string): string => {
  const quote = text.includes("'") && !text.includes('"') ? '"' : "'"
  let out = quote
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    if (char === '\\' || char === quote) out += `\\${char}`
    else if (char === '\n') out += '\\n'
    else if (char === '\r') out += '\\r'
    else if (char === '\t') out += '\\t'
    else if (code < 0x20 || (code >= 0x7f && code <= 0xa0) || code === 0xad)
      out += `\\x${code.toString(16).padStart(2, '0')}`
    else out += char
  }
  return out + quote
}

// Python \b around a literal phrase (str patterns are Unicode-aware).
const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export const has = (head: string, phrase: string): boolean =>
  new RegExp(`(?<![\\p{L}\\p{N}_])${escape(phrase)}(?![\\p{L}\\p{N}_])`, 'u').test(head)

// --- Decimal: value = m * 10^e, exact. Python Decimal(str(float)) and the sums built on it.
export interface Dec {
  m: bigint
  e: number
}

const DECIMAL = /^([+-]?)(\d+)?(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/

export const dec = (value: number | string): Dec => {
  const text = typeof value === 'number' ? String(value) : value
  const found = DECIMAL.exec(text)
  if (!found || (found[2] === undefined && !found[3])) throw new Error(`InvalidOperation: ${text}`)
  const [, sign, whole = '', fraction = '', exponent = '0'] = found
  return { m: BigInt(`${sign}${whole}${fraction}`), e: Number(exponent) - fraction.length }
}

export const ZERO: Dec = { m: 0n, e: 0 }

export const add = (a: Dec, b: Dec): Dec => {
  const e = Math.min(a.e, b.e)
  return { m: a.m * 10n ** BigInt(a.e - e) + b.m * 10n ** BigInt(b.e - e), e }
}

export const sumDec = (values: readonly Dec[]): Dec => values.reduce(add, ZERO)

export const toFloat = (value: Dec): number => Number(`${value.m}e${value.e}`)

export const absDec = (value: Dec): Dec => ({ m: value.m < 0n ? -value.m : value.m, e: value.e })

// (value / divisor) quantized to cents. halfUp: ROUND_HALF_UP (ties away from zero); else HALF_EVEN.
// shortcut: exact rational rounding; Decimal rounds the quotient to 28 digits first, which only
// differs on a quotient within 1e-26 of a half-cent tie.
export const cents = (value: Dec, divisor: bigint, halfUp: boolean): Dec => {
  let numerator = value.m
  let denominator = divisor
  const shift = value.e + 2
  if (shift >= 0) numerator *= 10n ** BigInt(shift)
  else denominator *= 10n ** BigInt(-shift)
  const negative = numerator < 0n
  if (negative) numerator = -numerator
  let quotient = numerator / denominator
  const twice = (numerator % denominator) * 2n
  if (twice > denominator || (twice === denominator && (halfUp || quotient % 2n === 1n))) quotient += 1n
  return { m: negative ? -quotient : quotient, e: -2 }
}

// --- Python helpers of document_parse.py

const MONEY = /\$[0-9,.-]+/

// _money: float(Decimal(...)) of the first "$…" run; an unparsable run is Python's InvalidOperation.
export const money = (value: string): number => {
  const found = MONEY.exec(value)
  if (!found) throw new ExtractError(`No dollar amount in ${pyRepr(value)}`)
  const digits = found[0].replace('$', '').replace(/,/g, '')
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(digits)) throw new Error(`InvalidOperation: ${digits}`)
  return Number(digits)
}

export const PAY_PERIODS: Record<string, bigint> = { weekly: 52n, biweekly: 26n, semimonthly: 24n, monthly: 12n }

export const toMonthly = (amount: Dec, frequency: string): number =>
  toFloat(cents({ m: amount.m * PAY_PERIODS[frequency], e: amount.e }, 12n, true))

export const pairs = (texts: readonly string[]): Map<string, string> => {
  const found = new Map<string, string>()
  texts.slice(0, -1).forEach((text, index) => {
    if (text.endsWith(':')) found.set(strip(text.slice(0, -1)), strip(texts[index + 1]))
  })
  return found
}

export const requireLabels = (found: Map<string, string>, ...labels: string[]): Map<string, string> => {
  const missing = labels.filter((label) => !found.has(label))
  if (missing.length) throw new ExtractError(`Missing ${missing.join(', ')}`)
  return found
}

export const pick = (found: Map<string, string>, ...labels: string[]): string => {
  for (const label of labels) {
    const value = found.get(label)
    if (value !== undefined) return value
  }
  throw new ExtractError(`Missing ${labels[0]}`)
}

export const nextMoney = (texts: readonly string[], start: number): number => {
  for (const text of texts.slice(start + 1, start + 6)) if (text.includes('$')) return money(text)
  throw new ExtractError(`No amount after ${pyRepr(texts[start])}`)
}

export const firstLabeled = (texts: readonly string[], ...labels: string[]): number => {
  for (const label of labels) {
    const index = texts.indexOf(label)
    if (index >= 0) return nextMoney(texts, index)
  }
  throw new ExtractError(`Missing ${labels[0]}`)
}

// Missing withholding lines are zero. A present line with no amount still fails.
export const labeledAmount = (texts: readonly string[], label: string): Dec => {
  const index = texts.indexOf(label)
  return index >= 0 ? dec(nextMoney(texts, index)) : ZERO
}

// A date as Python's date.isoformat(), so the fixture JSON and comparisons line up.
export type IsoDate = string

const DATE_PARTS = '(1[0-2]|0[1-9]|[1-9])SEP(3[01]|[12]\\d|0[1-9]|[1-9]| [1-9])SEP(\\d\\d\\d\\d)'
const DATE_FORMATS = ['/', '-'].map((sep) => new RegExp(`^${DATE_PARTS.replaceAll('SEP', sep)}$`))
const daysIn = (year: number, month: number): number =>
  month === 2 ? (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31

// _date: strptime "%m/%d/%Y" then "%m-%d-%Y" on the stripped value.
export const pyDate = (value: string): IsoDate => {
  const text = strip(value)
  for (const format of DATE_FORMATS) {
    const found = format.exec(text)
    if (!found) continue
    const [month, day, year] = [Number(found[1]), Number(found[2]), Number(found[3])]
    if (year < 1 || day > daysIn(year, month)) continue
    return `${found[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  throw new ExtractError(`Bad date ${pyRepr(value)}`)
}

export const monthsBetween = (start: IsoDate, end: IsoDate): number => {
  const [sy, sm, sd] = start.split('-').map(Number)
  const [ey, em, ed] = end.split('-').map(Number)
  const months = (ey - sy) * 12 + (em - sm)
  return ed < sd ? months - 1 : months
}

const STATE = new RegExp(`(?<![\\p{L}\\p{N}_])([A-Z]{2})[${WS}]+\\p{Nd}{5}(?![\\p{L}\\p{N}_])`, 'u')

export const stateCode = (address: string): string => {
  const found = STATE.exec(address)
  if (!found) throw new ExtractError(`No state in ${pyRepr(address)}`)
  return found[1]
}
