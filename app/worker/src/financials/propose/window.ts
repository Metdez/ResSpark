// The last N complete calendar months before `now` (UTC), as ISO dates.
const iso = (d: Date) => d.toISOString().slice(0, 10)

export function completeMonthsWindow(now: Date, months: 3 | 6): { start: string; end: string; months: 3 | 6 } {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  // Day 0 of this month is the last day of the previous one; Date.UTC normalizes negative months.
  return { start: iso(new Date(Date.UTC(y, m - months, 1))), end: iso(new Date(Date.UTC(y, m, 0))), months }
}
