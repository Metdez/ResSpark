import { TONE_CLASSES, type Tone } from '@/lib/status'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import type { LineStatus } from './api'

// D-10 display names; a source this map does not know still renders, as its raw value.
const SOURCES: Record<string, string> = {
  truv: 'Truv',
  plaid: 'Plaid',
  intake: 'Intake',
  logics: 'Logics',
  address: 'Address',
  document: 'Document',
  staff: 'Staff',
}

export const sourceName = (source: string): string => SOURCES[source] ?? source

export function SourceBadge({ source }: { source: string }) {
  return (
    <Badge variant='outline' className={cn('font-normal', TONE_CLASSES.neutral)}>
      {sourceName(source)}
    </Badge>
  )
}

const CHIPS: Record<LineStatus, { tone: Tone; label: string }> = {
  needs_data: { tone: 'warning', label: 'Needs data' },
  proposed: { tone: 'info', label: 'Proposed' },
  confirmed: { tone: 'success', label: 'Confirmed' },
  edited: { tone: 'neutral', label: 'Edited' },
  standard: { tone: 'muted', label: 'IRS standard' },
}

export function StatusChip({ status }: { status: LineStatus }) {
  const chip = CHIPS[status]
  return (
    <Badge variant='outline' className={cn('rounded-full font-normal', TONE_CLASSES[chip.tone])}>
      {chip.label}
    </Badge>
  )
}
