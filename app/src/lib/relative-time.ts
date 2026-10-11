const UNITS: [string, number][] = [
  ['d', 86_400_000],
  ['h', 3_600_000],
  ['min', 60_000],
]

// UI-SPEC dense tables: the largest unit the gap reaches (5 min ago, 3 h ago, 2 d ago, in 13 d);
// callers put the ISO in `title`.
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (iso == null) return '—'
  const ms = now - Date.parse(iso)
  const abs = Math.abs(ms)
  if (abs < 45_000) return 'just now'
  const [unit, size] = UNITS.find(([, s]) => abs >= s) ?? ['min', 60_000]
  const n = Math.round(abs / size)
  return ms < 0 ? `in ${n} ${unit}` : `${n} ${unit} ago`
}

export function minutesSince(iso: string, now = Date.now()): number {
  return Math.floor((now - Date.parse(iso)) / 60_000)
}
