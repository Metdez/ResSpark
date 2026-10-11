import { useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { REJECT_PRESETS } from './api'

const MAX = 500

// A Dialog, not an AlertDialog: the decision needs an input (UI-SPEC destructive confirmation otherwise).
export function RejectDialog({
  open,
  onOpenChange,
  onConfirm,
  pending,
  error,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  onConfirm(note: string): void
  pending: boolean
  error?: React.ReactNode
}) {
  const [note, setNote] = useState('')
  const cancel = useRef<HTMLButtonElement>(null)
  const fieldId = useId()
  const tooLong = note.length > MAX
  const disabled = pending || tooLong || note.trim().length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          cancel.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>Reject this item?</DialogTitle>
          <DialogDescription>The client will see your note and be asked to upload again.</DialogDescription>
        </DialogHeader>
        <div className='flex flex-wrap gap-2'>
          {REJECT_PRESETS.map((p) => (
            <Button key={p} type='button' variant='outline' size='sm' onClick={() => setNote(p)}>
              {p}
            </Button>
          ))}
        </div>
        <div className='grid gap-1'>
          <label htmlFor={fieldId} className='text-sm font-medium'>
            Note to the client
          </label>
          <Textarea
            id={fieldId}
            value={note}
            maxLength={500}
            aria-invalid={tooLong || undefined}
            onChange={(e) => setNote(e.target.value)}
          />
          {tooLong ? (
            <p className='text-sm text-destructive'>Keep the note under 500 characters.</p>
          ) : (
            note.length >= 450 && (
              <p className='text-sm text-muted-foreground tabular-nums'>
                {note.length}/{MAX}
              </p>
            )
          )}
          {error}
        </div>
        <DialogFooter>
          <Button ref={cancel} type='button' variant='outline' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type='button' variant='destructive' disabled={disabled} onClick={() => onConfirm(note.trim())}>
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
