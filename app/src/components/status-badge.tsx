import { TONE_CLASSES, type Tone } from '@/lib/status'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export function StatusBadge({
  tone,
  label,
  size = 'sm',
}: {
  tone: Tone
  label: string
  size?: 'sm' | 'lg'
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
      {label}
    </Badge>
  )
}
