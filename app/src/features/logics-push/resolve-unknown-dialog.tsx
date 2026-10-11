import { useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import { GENERIC_ERROR } from '@/lib/handle-server-error'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { PUSH_ERROR_COPY, type LedgerPush } from './api'
import { useResolvePush } from './use-logics-push'

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

// D-04: the only two ways out of `unknown`. A Dialog, not an AlertDialog, because it holds an input.
export function ResolveUnknownDialog({
  push,
  onOpenChange,
  requestId,
  caseId,
  allowMarkSent,
}: {
  push: LedgerPush | null
  onOpenChange(open: boolean): void
  requestId: string
  caseId: string
  allowMarkSent: boolean
}) {
  const resolve = useResolvePush(requestId, caseId)
  const [docId, setDocId] = useState('')
  const cancel = useRef<HTMLButtonElement>(null)
  const fieldId = useId()
  if (!push) return null

  const typed = docId.trim()
  const parsed = typed === '' ? undefined : Number(typed)
  const badId = parsed !== undefined && !(Number.isInteger(parsed) && parsed > 0)
  const error =
    resolve.error instanceof ApiError
      ? (PUSH_ERROR_COPY[resolve.error.code] ?? GENERIC_ERROR)
      : resolve.error && GENERIC_ERROR

  const run = (action: 'mark_sent' | 'resend') =>
    resolve.mutate(
      { pushId: push.id, action, ...(action === 'mark_sent' && parsed !== undefined && { logics_document_id: parsed }) },
      {
        onSuccess: () => {
          toast.success(action === 'mark_sent' ? 'Marked as sent' : 'Re-send queued')
          onOpenChange(false)
        },
      }
    )

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          cancel.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{allowMarkSent ? "Logics didn't confirm this file" : 'Re-send this file?'}</DialogTitle>
          <DialogDescription>
            {allowMarkSent
              ? `ResSpark sent ${push.file_name} to Logics at ${when(push.claimed_at ?? push.created_at)} and did not get a readable answer. Logics may or may not have stored it. Nobody can look it up by API.`
              : `This file failed to send (${push.error_detail ?? push.error_code ?? 'no details'}). Re-send creates a new attempt with the same bytes.`}
          </DialogDescription>
        </DialogHeader>
        {allowMarkSent && (
          <div className='grid gap-2 rounded-lg border p-4'>
            <label htmlFor={fieldId} className='text-sm font-medium'>
              CaseDocumentID (optional)
            </label>
            <Input
              id={fieldId}
              inputMode="numeric"
              value={docId}
              aria-invalid={badId || undefined}
              onChange={(e) => setDocId(e.target.value)}
            />
            {badId && <p className='text-sm text-destructive'>Enter the number only, like 128346.</p>}
            <Button type='button' disabled={badId || resolve.isPending} onClick={() => run('mark_sent')}>
              I checked Logics — it's there
            </Button>
            <p className='text-sm text-muted-foreground'>Marks this file as sent.</p>
          </div>
        )}
        <div className='grid gap-2 rounded-lg border p-4'>
          <Button type='button' variant='outline' disabled={resolve.isPending} onClick={() => run('resend')}>
            Re-send
          </Button>
          {allowMarkSent && (
            <p className='text-sm text-muted-foreground'>
              Re-send may create a duplicate in Logics if the first upload did arrive.
            </p>
          )}
        </div>
        {error && (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button ref={cancel} type='button' variant='outline' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
