import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Inbox } from 'lucide-react'
import { itemStatusBadge } from '@/lib/status'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { UploadSheet } from '@/features/uploads/upload-sheet'
import { ComingNextSheet } from './coming-next-sheet'
import type { PortalStep } from './portal-api'
import { STEP_DESCRIPTIONS } from './step-copy'

interface StepListProps {
  steps: PortalStep[]
  onView?: (step: PortalStep) => void
}

// D-11: one column of 44 px rows in position order; View opens the step (upload) or Coming next.
export function StepList({ steps, onView = () => {} }: StepListProps) {
  const [viewing, setViewing] = useState<PortalStep | null>(null)
  const qc = useQueryClient()
  if (steps.length === 0)
    return (
      <div className='flex flex-col items-center gap-2 text-center'>
        <Inbox className='size-12 text-muted-foreground' aria-hidden='true' />
        <h3 className='text-xl leading-tight font-semibold'>
          Nothing to do yet
        </h3>
        <p className='text-base text-muted-foreground'>
          Your agent hasn't added any steps yet. You can close this page.
        </p>
      </div>
    )

  const ordered = [...steps].sort((a, b) => a.position - b.position)
  return (
    <>
      <ul>
        {ordered.map((step) => {
          const badge = itemStatusBadge(step.status, 'client')
          return (
            <li
              key={step.id}
              data-step-row
              className='flex min-h-11 flex-wrap items-center gap-4 border-b py-3 last:border-0'
            >
              <div className='min-w-0 flex-1 basis-40'>
                <p
                  data-step-label
                  className='text-base font-medium break-words'
                >
                  {step.label}
                </p>
                <p className='text-base text-muted-foreground'>
                  {STEP_DESCRIPTIONS[step.kind]}
                </p>
              </div>
              <div className='flex items-center gap-3'>
                <StatusBadge tone={badge.tone} label={badge.label} size='lg' />
                <Button
                  size='xl'
                  variant='outline'
                  aria-label={`View ${step.label}`}
                  onClick={() => {
                    setViewing(step)
                    onView(step)
                  }}
                >
                  View
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
      {viewing?.kind === 'upload' ? (
        <UploadSheet
          item={{
            id: viewing.id,
            label: viewing.label,
            status: viewing.status,
          }}
          open
          onClose={() => {
            setViewing(null)
            // the chip turns into "With your agent" once the Worker marks the item submitted
            void qc.invalidateQueries({ queryKey: ['portal', 'state'] })
          }}
        />
      ) : (
        <ComingNextSheet step={viewing} onClose={() => setViewing(null)} />
      )}
    </>
  )
}
