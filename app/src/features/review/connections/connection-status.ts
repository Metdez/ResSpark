import type { Tone } from '@/lib/status'

type Badge = { tone: Tone; label: string }

const STATUS: Record<string, Badge> = {
  pending: { tone: 'neutral', label: 'Waiting for client' },
  connected: { tone: 'info', label: 'Connected' },
  syncing: { tone: 'info', label: 'Syncing (bank is sending history)' },
  done: { tone: 'success', label: 'Done' },
  removed: { tone: 'muted', label: 'Removed' },
}

const ERRORS: Record<string, string> = {
  ITEM_LOGIN_REQUIRED: 'Client must reconnect',
  order_expired: 'Order expired',
  link_expired: 'Link timed out',
}

export function connectionBadge(status: string, errorCode: string | null): Badge {
  if (status === 'error') return { tone: 'destructive', label: (errorCode && ERRORS[errorCode]) || 'Error' }
  return STATUS[status] ?? { tone: 'neutral', label: status }
}

export function transactionsLine(count: number, updateStatus: string | null): string {
  const state = updateStatus === 'historical' ? 'Up to date' : updateStatus === null ? 'Not started' : 'Syncing'
  return `Transactions: ${count} · ${state}`
}

const CELLS: Record<string, Badge> = {
  available: { tone: 'success', label: 'Statement' },
  manual: { tone: 'info', label: 'Uploaded' },
  not_supported: { tone: 'muted', label: 'Not from bank' },
  missing: { tone: 'warning', label: 'Missing' },
  pending: { tone: 'neutral', label: 'Checking' },
}

export function cellBadge(status: string): Badge {
  return CELLS[status] ?? CELLS.missing
}

const EMPLOYER: Record<string, Badge> = {
  pending: { tone: 'neutral', label: 'Waiting for client' },
  connected: { tone: 'info', label: 'Connected' },
  done: { tone: 'success', label: 'Done' },
  error: { tone: 'destructive', label: 'Needs attention' },
}

export function employerBadge(status: string): Badge {
  return EMPLOYER[status] ?? { tone: 'neutral', label: status }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function employerCounts(e: { pay_stubs: number; w2s: number; income_reports: number }): string {
  const parts = [
    e.pay_stubs ? plural(e.pay_stubs, 'pay stub', 'pay stubs') : '',
    e.w2s ? plural(e.w2s, 'W-2', 'W-2s') : '',
    e.income_reports ? plural(e.income_reports, 'income report', 'income reports') : '',
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'No documents yet'
}
