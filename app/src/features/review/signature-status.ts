import type { Tone } from '@/lib/status'
import type { EsignStage } from './api'

type Chip = { tone: Tone; label: string }

// D-20 chip; tones follow connection-status.ts (neutral waiting, info in progress, success done).
const CHIPS: Record<EsignStage, Chip> = {
  not_started: { tone: 'neutral', label: 'Waiting' },
  waiting: { tone: 'neutral', label: 'Waiting' },
  viewed: { tone: 'info', label: 'Viewed' },
  signing: { tone: 'info', label: 'Signing' },
  signed: { tone: 'success', label: 'Signed' },
  declined: { tone: 'destructive', label: 'Declined' },
  expired: { tone: 'warning', label: 'Expired' },
  error: { tone: 'destructive', label: 'Needs attention' },
}

export function signatureChip(stage: EsignStage | null): Chip {
  return CHIPS[stage ?? 'not_started'] ?? CHIPS.error
}
