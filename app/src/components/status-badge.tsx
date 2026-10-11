import { Loader2 } from 'lucide-react'
import { TONE_CLASSES, type Tone } from '@/lib/status'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export function StatusBadge({
  tone,
  label,
  size = 'sm',
  icon,
}: {
  tone: Tone
  label: string
  size?: 'sm' | 'lg'
  icon?: React.ReactNode
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-full px-3 py-1 text-sm font-normal',
        TONE_CLASSES[tone],
        size === 'lg' && 'text-base'
      )}
    >
      {icon}
      {label}
    </Badge>
  )
}

// Logics push ledger states (Phase 5 D-09), on the inherited UI-SPEC palette.
export type PushState = 'queued' | 'sending' | 'sent' | 'failed' | 'unknown'

const PUSH: Record<PushState, { tone: Tone; label: string }> = {
  queued: { tone: 'muted', label: 'Queued' },
  sending: { tone: 'info', label: 'Sending' },
  sent: { tone: 'success', label: 'Sent' },
  failed: { tone: 'destructive', label: 'Failed' },
  unknown: { tone: 'warning', label: 'Unknown' },
}

export function PushStatusBadge({ state, label }: { state: PushState; label?: string }) {
  const badge = PUSH[state]
  return (
    <StatusBadge
      tone={badge.tone}
      label={label ?? badge.label}
      icon={state === 'sending' && <Loader2 aria-hidden='true' className='size-3 animate-spin' />}
    />
  )
}
