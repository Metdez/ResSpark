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
