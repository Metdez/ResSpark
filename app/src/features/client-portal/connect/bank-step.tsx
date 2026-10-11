import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { UploadSheet } from '@/features/uploads/upload-sheet'
import type { PortalStep } from '../portal-api'
import { CONNECT_COPY } from './connect-copy'

const T = CONNECT_COPY.bank

// Placeholder until 04-05 Task 2: the upload fallback is already real; the connect flow is not.
export function BankStep({
  step,
  open,
  onClose,
}: {
  step: PortalStep
  firmName: string
  open: boolean
  onClose(): void
}) {
  const qc = useQueryClient()
  const [uploading, setUploading] = useState(false)
  if (uploading)
    return (
      <UploadSheet
        item={{ id: step.id, label: step.label, status: step.status }}
        open
        onClose={() => {
          setUploading(false)
          void qc.invalidateQueries({ queryKey: ['portal', 'state'] })
        }}
      />
    )
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side='bottom' className='mx-auto max-w-[30rem] rounded-t-lg [&>button:last-child]:hidden'>
        <SheetHeader className='p-6 pb-0'>
          <SheetTitle className='text-xl leading-tight'>{step.label}</SheetTitle>
          <SheetDescription className='sr-only'>{T.intro}</SheetDescription>
        </SheetHeader>
        <div className='grid gap-4 px-6 pb-6'>
          <Button size='xl' variant='outline' className='w-full' onClick={() => setUploading(true)}>
            {T.upload}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
