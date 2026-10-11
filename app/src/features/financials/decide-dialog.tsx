import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { LineView } from './api'
import { parseInputValue } from './format'

const MAX_NOTE = 2000
const HINTS: Partial<Record<LineView['kind'], string>> = {
  money: 'Dollars, up to 2 decimals.',
  count: 'A whole number.',
  money_list: 'One amount per vehicle, separated by commas, no thousands separators.',
}

// Mounted only while open, so every opening starts empty. Not applicable sends a note only:
// the decide RPC writes the line's not-applicable value itself (D-06).
export function DecideDialog({
  mode,
  line,
  pending,
  onClose,
  onSave,
}: {
  mode: 'edit' | 'not_applicable'
  line: LineView
  pending: boolean
  onClose(): void
  onSave(v: { value?: unknown; note: string }): void
}) {
  const [raw, setRaw] = useState('')
  const [note, setNote] = useState('')
  const valueId = useId()
  const noteId = useId()
  const edit = mode === 'edit'
  const parsed = parseInputValue(line.kind, raw)
  const noteOk = note.trim().length > 0 && note.length <= MAX_NOTE
  const disabled = pending || !noteOk || (edit && !parsed.ok)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{edit ? `Edit ${line.label}` : `Mark ${line.label} not applicable`}</DialogTitle>
          <DialogDescription>
            {edit
              ? 'Your value becomes the confirmed fact. The note is kept with the change.'
              : 'The line is recorded as not applicable, with your note.'}
          </DialogDescription>
        </DialogHeader>
        {edit && (
          <div className='grid gap-2'>
            <label htmlFor={valueId} className='text-sm font-medium'>
              Value
            </label>
            {line.kind === 'bool' ? (
              <div id={valueId} role='group' aria-label='Value' className='flex gap-2'>
                {['Yes', 'No'].map((v) => (
                  <Button
                    key={v}
                    type='button'
                    variant={raw === v ? 'secondary' : 'outline'}
                    aria-pressed={raw === v}
                    onClick={() => setRaw(v)}
                  >
                    {v}
                  </Button>
                ))}
              </div>
            ) : (
              <Input
                id={valueId}
                value={raw}
                inputMode={line.kind === 'text' ? 'text' : 'decimal'}
                aria-invalid={(raw !== '' && !parsed.ok) || undefined}
                onChange={(e) => setRaw(e.target.value)}
              />
            )}
            {raw !== '' && !parsed.ok ? (
              <p className='text-sm text-destructive'>{parsed.message}</p>
            ) : (
              HINTS[line.kind] && <p className='text-sm text-muted-foreground'>{HINTS[line.kind]}</p>
            )}
          </div>
        )}
        <div className='grid gap-2'>
          <label htmlFor={noteId} className='text-sm font-medium'>
            Note (required)
          </label>
          <Textarea id={noteId} value={note} maxLength={MAX_NOTE} onChange={(e) => setNote(e.target.value)} />
        </div>
        <DialogFooter className='gap-4'>
          <Button type='button' variant='outline' onClick={onClose}>
            Cancel
          </Button>
          <Button
            type='button'
            disabled={disabled}
            onClick={() => onSave(edit && parsed.ok ? { value: parsed.value, note: note.trim() } : { note: note.trim() })}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
