import type { Tone } from '@/lib/status'
import { StatusBadge } from '@/components/status-badge'
import type { ActorType } from './api'

const ACTOR_TONES: Record<ActorType, Tone> = {
  staff: 'info',
  client: 'success',
  system: 'neutral',
  provider: 'warning',
}

const ACTOR_LABELS: Record<ActorType, string> = {
  staff: 'Staff',
  client: 'Client',
  system: 'System',
  provider: 'Provider',
}

export function ActorBadge({ actorType }: { actorType: ActorType }) {
  return <StatusBadge tone={ACTOR_TONES[actorType]} label={ACTOR_LABELS[actorType]} />
}
