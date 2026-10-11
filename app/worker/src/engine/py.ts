// Python builtin semantics the engine port depends on for exact parity.

// max(a, b): the first argument wins a tie, so max(-0.0, 0) stays -0.0.
export const pyMax = (a: number, b: number): number => (b > a ? b : a)

// min(a, b): the first argument wins a tie.
export const pyMin = (a: number, b: number): number => (b < a ? b : a)

// Python 3.11 sum(): start at 0, add left to right (3.12+ compensates; the exporter refuses it).
export const sumInOrder = (values: readonly number[]): number => {
  let total = 0
  for (const value of values) total += value
  return total
}

// f"{x:,.{digits}f}": thousands commas, correctly rounded; exact binary ties go to even like Python.
export const pyFixed = (x: number, digits: number): string => {
  const magnitude = Math.abs(x)
  let text = magnitude.toFixed(digits) // rounds the exact binary value, but exact ties go up
  const exact = magnitude.toFixed(100) // the double's exact decimal expansion
  const cut = exact.indexOf('.') + 1 + digits
  if (/^50*$/.test(exact.slice(cut))) {
    const kept = exact.slice(0, digits ? cut : cut - 1)
    if (Number(kept.at(-1)) % 2 === 0) text = kept
  }
  const [whole, fraction] = text.split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const sign = x < 0 || Object.is(x, -0) ? '-' : ''
  return sign + (fraction === undefined ? grouped : `${grouped}.${fraction}`)
}

// int(Decimal(str(x)).quantize(Decimal("1"), ROUND_HALF_UP)): half away from zero on the shortest repr.
export const wholeDollars = (amount: number): number => {
  const text = String(Math.abs(amount)) // JS and Python both print the shortest round-trip digits
  // shortcut: exponent forms here are only |x| < 1e-6 (rounds to 0) or >= 1e21 (already whole).
  if (text.includes('e')) return Math.abs(amount) < 1 ? 0 : amount
  const [whole, fraction = ''] = text.split('.')
  const rounded = Number(whole) + (fraction[0] >= '5' ? 1 : 0)
  return amount < 0 && rounded !== 0 ? -rounded : rounded
}
