import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Inbox } from 'lucide-react'
import { itemStatusBadge } from '@/lib/status'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import type { UploadErrorCode } from '@/features/uploads/copy'
import { UploadSheet } from '@/features/uploads/upload-sheet'
import { AddressSheet } from './address/address-sheet'
import { ComingNextSheet } from './coming-next-sheet'
import { BankStep } from './connect/bank-step'
import { PayrollStep } from './connect/payroll-step'
import type { PortalStep } from './portal-api'
import { SIGN_COPY } from './sign/sign-copy'
import { STEP_DESCRIPTIONS } from './step-copy'

interface StepListProps {
  steps: PortalStep[]
  firmName: string
  onView?: (step: PortalStep) => void
  onCloseStep?: () => void
  onUploadError?: (code: UploadErrorCode) => void
  autoOpenId?: string
  onAutoOpened?: () => void
}

// D-11: one column of 44 px rows in position order; View opens the step (upload) or Coming next.
export function StepList({
  steps,
  firmName,
  onView = () => {},
  onCloseStep = () => {},
  onUploadError,
  autoOpenId,
  onAutoOpened,
}: StepListProps) {
  const [viewing, setViewing] = useState<PortalStep | null>(null)
  const qc = useQueryClient()
  const navigate = useNavigate()
  // D-14: signing is its own full-bleed route; every other step opens a sheet over the list.
  const open = (step: PortalStep) => {
    onView(step)
    if (step.kind === 'signature')
      void navigate({ to: '/c/sign/$itemId', params: { itemId: step.id }, replace: false })
    else setViewing(step)
  }
  // D-17 deep link: open the linked step once, as a tap would. The sheet opens during render
  // (no cascading effect render); the callbacks and navigation run after commit. A signature
  // replaces the history entry so Back cannot loop into it; a sheet asks the parent to clear `step`.
  const autoStep = steps.find((s) => s.id === autoOpenId)
  const [autoShown, setAutoShown] = useState<string>()
  if (autoStep && autoShown !== autoStep.id) {
    setAutoShown(autoStep.id)
    if (autoStep.kind !== 'signature') setViewing(autoStep)
  }
  const autoAnnounced = useRef<string>(undefined)
  useEffect(() => {
    if (!autoStep || autoAnnounced.current === autoStep.id) return
    autoAnnounced.current = autoStep.id
    onView(autoStep)
    if (autoStep.kind === 'signature')
      void navigate({ to: '/c/sign/$itemId', params: { itemId: autoStep.id }, replace: true })
    else onAutoOpened?.()
  })
  const close = () => {
    setViewing(null)
    onCloseStep()
  }
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
          const sign =
            step.kind === 'signature' && step.status !== 'submitted' && step.status !== 'approved'
          const action = sign ? SIGN_COPY.signButton : 'View'
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
                  aria-label={`${action} ${step.label}`}
                  onClick={() => open(step)}
                >
                  {action}
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
          onError={onUploadError}
          onClose={() => {
            close()
            // the chip turns into "With your agent" once the Worker marks the item submitted
            void qc.invalidateQueries({ queryKey: ['portal', 'state'] })
          }}
        />
      ) : viewing?.kind === 'address' ? (
        <AddressSheet step={viewing} open onClose={close} />
      ) : viewing?.kind === 'payroll_connect' ? (
        <PayrollStep step={viewing} firmName={firmName} open onClose={close} />
      ) : viewing?.kind === 'bank_connect' ? (
        <BankStep step={viewing} firmName={firmName} open onClose={close} />
      ) : (
        <ComingNextSheet step={viewing} onClose={close} />
      )}
    </>
  )
}
