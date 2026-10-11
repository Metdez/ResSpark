import { Button } from '@/components/ui/button'
import type { FinancialsView } from './api'
import { formatDay } from './format'
import { useRefresh } from './use-financials'

const WINDOWS = [3, 6] as const

// D-14 header: progress, the 3 / 6 month statement window, Refresh proposals, and an `actions` slot.
export function FinancialsHeader({ caseId, view, actions }: { caseId: string; view: FinancialsView; actions?: React.ReactNode }) {
  const refresh = useRefresh(caseId)
  const current = view.settings.window_months
  return (
    <div className='mb-6 flex flex-wrap items-center gap-3'>
      <p className='font-medium tabular-nums'>
        {view.required.confirmed} of {view.required.total} required facts confirmed
      </p>
      <div role='group' aria-label='Statement window' className='inline-flex gap-1 rounded-md border p-0.5'>
        {WINDOWS.map((m) => (
          <Button
            key={m}
            type='button'
            size='sm'
            variant={m === current ? 'secondary' : 'ghost'}
            aria-pressed={m === current}
            disabled={refresh.isPending}
            onClick={() => m !== current && refresh.mutate({ window_months: m })}
          >
            {m} months
          </Button>
        ))}
      </div>
      <span className='text-sm text-muted-foreground tabular-nums'>
        {formatDay(view.window.start)} – {formatDay(view.window.end)}
      </span>
      <Button type='button' size='sm' variant='outline' disabled={refresh.isPending} onClick={() => refresh.mutate({})}>
        Refresh proposals
      </Button>
      {actions}
    </div>
  )
}
