export type Tone =
  | 'neutral'
  | 'info'
  | 'warning'
  | 'success'
  | 'destructive'
  | 'muted'

// UI-SPEC "Status badge palette — Inherited", light then dark classes, verbatim.
export const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-muted text-foreground border-border',
  info: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800',
  warning:
    'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  success:
    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
  destructive:
    'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
  muted: 'bg-transparent text-muted-foreground border-border',
}

type Badge = { tone: Tone; label: string }

const REQUEST: Record<string, Badge> = {
  draft: { tone: 'neutral', label: 'Draft' },
  sent: { tone: 'neutral', label: 'Sent' },
  opened: { tone: 'info', label: 'Opened' },
  in_progress: { tone: 'info', label: 'In progress' },
  waiting_on_staff: { tone: 'warning', label: 'Waiting on staff' },
  complete: { tone: 'success', label: 'Complete' },
  revoked: { tone: 'muted', label: 'Revoked' },
}

const ITEM: Record<'staff' | 'client', Record<string, Badge>> = {
  staff: {
    pending: { tone: 'neutral', label: 'Not started' },
    in_progress: { tone: 'info', label: 'In progress' },
    submitted: { tone: 'warning', label: 'Needs review' },
    approved: { tone: 'success', label: 'Approved' },
    rejected: { tone: 'destructive', label: 'Rejected' },
  },
  // Clients never see "review": once they submit, their part is done and the item waits on the agent.
  client: {
    pending: { tone: 'neutral', label: 'Not started' },
    in_progress: { tone: 'info', label: 'In progress' },
    submitted: { tone: 'warning', label: 'With your agent' },
    approved: { tone: 'success', label: 'Done' },
    rejected: { tone: 'destructive', label: 'Needs attention' },
  },
}

const DOCUMENT: Record<string, Badge> = {
  uploading: { tone: 'neutral', label: 'Uploading' },
  ready: { tone: 'success', label: 'Ready' },
  rejected: { tone: 'destructive', label: 'Rejected' },
  deleted: { tone: 'muted', label: 'Deleted' },
}

export const OVERDUE_BADGE = { tone: 'destructive', label: 'Overdue' } as const

// A status this map does not know yet still renders, as its raw value.
const fallback = (status: string): Badge => ({ tone: 'neutral', label: status })

export function requestStatusBadge(status: string): Badge {
  return REQUEST[status] ?? fallback(status)
}

export function itemStatusBadge(
  status: string,
  audience: 'staff' | 'client'
): Badge {
  return ITEM[audience][status] ?? fallback(status)
}

export function documentStatusBadge(status: string): Badge {
  return DOCUMENT[status] ?? fallback(status)
}
