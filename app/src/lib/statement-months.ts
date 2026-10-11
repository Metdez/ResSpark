// Bank-statement window: pull 6 months, the standard resolution packet uses the last 3.
// Shared by the Worker and the SPA; UTC so both sides agree on the month.
export const STATEMENT_MONTHS = 6
export const STANDARD_MONTHS = 3

export interface MonthCell {
  year: number
  month: number
}

const NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Newest first, starting with the month before `now`: the current month has no statement yet.
export function targetMonths(now: Date, count = STATEMENT_MONTHS): MonthCell[] {
  const current = now.getUTCFullYear() * 12 + now.getUTCMonth()
  return Array.from({ length: count }, (_, i) => {
    const idx = current - 1 - i
    return { year: Math.floor(idx / 12), month: (idx % 12) + 1 }
  })
}

export const monthLabel = (year: number, month: number) => `${NAMES[month - 1]} ${year}`

export const isInWindow = (cell: MonthCell, now: Date, count = STATEMENT_MONTHS) =>
  targetMonths(now, count).some((m) => m.year === cell.year && m.month === cell.month)
