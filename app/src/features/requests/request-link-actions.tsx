import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { maskPhone } from '@/lib/contact'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  emailLink,
  formatDate,
  recordConsent,
  regenerateLink,
  revokeLink,
  unlessHandled,
  type EmailResult,
  type RequestDetail,
} from './requests-api'

// The link changed under us (another tab or teammate): explain, then refetch.
const CONFLICTS = ['request_not_active', 'request_revoked']
const isConflict = (e: unknown) =>
  e instanceof ApiError && CONFLICTS.includes(e.code)

function emailCopy(result: EmailResult, to: string | null) {
  if (result.ok) return `Email sent to ${to}`
  return result.reason === 'not_configured'
    ? 'Email not configured — copy the link and send it yourself'
    : 'Email failed — copy the link and send it yourself'
}

export function RequestLinkActions({
  request,
  onChanged,
}: {
  request: RequestDetail
  onChanged(): void
}) {
  const qc = useQueryClient()
  const [dialog, setDialog] = useState<'regenerate' | 'revoke' | null>(null)
  const linkChange = {
    onError: unlessHandled(qc, isConflict),
    onSettled: (_: unknown, error: Error | null) => {
      setDialog(null)
      if (!error || isConflict(error)) onChanged()
    },
  }
  const email = useMutation({ mutationFn: () => emailLink(request.id) })
  const regenerate = useMutation({
    mutationFn: (_: void) => regenerateLink(request.id),
    ...linkChange,
  })
  const revoke = useMutation({
    mutationFn: (_: void) => revokeLink(request.id),
    ...linkChange,
  })
  // Unchecked by default; one post per page load (disabled once pending or recorded).
  const consent = useMutation({ mutationFn: () => recordConsent(request.id) })

  const phone = request.contact_phone_e164 ?? request.case.phone_e164
  const conflict = isConflict(regenerate.error) || isConflict(revoke.error)
  const consentLocked = consent.isPending || consent.isSuccess

  return (
    <div className='mt-4 grid gap-4'>
      {conflict && (
        <Alert>
          <AlertTitle className='whitespace-normal'>
            This link was already changed
          </AlertTitle>
          <AlertDescription>
            Reload the page to see the latest state.
          </AlertDescription>
        </Alert>
      )}

      {request.status !== 'revoked' && (
        <div className='grid gap-2'>
          <div className='flex flex-wrap gap-4'>
            <Button
              type='button'
              variant='outline'
              disabled={email.isPending}
              onClick={() => email.mutate()}
            >
              {email.isPending && <Loader2 className='size-4 animate-spin' />}
              {email.isPending ? 'Emailing…' : 'Email link'}
            </Button>
            <Button
              type='button'
              variant='outline'
              onClick={() => setDialog('regenerate')}
            >
              Regenerate link
            </Button>
            <Button
              type='button'
              variant='outline'
              className='text-destructive'
              onClick={() => setDialog('revoke')}
            >
              Revoke link
            </Button>
          </div>
          {email.data && (
            <p
              className={
                email.data.ok
                  ? 'text-sm text-emerald-700 dark:text-emerald-300'
                  : 'text-sm text-muted-foreground'
              }
            >
              {emailCopy(email.data, request.contact_email)}
            </p>
          )}
        </div>
      )}

      {phone && (
        <div className='grid gap-1'>
          <div className='flex items-center gap-2'>
            <Checkbox
              id={`consent-${request.id}`}
              checked={consentLocked}
              disabled={consentLocked}
              onCheckedChange={(v) => v === true && consent.mutate()}
            />
            <Label htmlFor={`consent-${request.id}`} className='font-normal'>
              Client agreed on this call to receive a text at {maskPhone(phone)}
            </Label>
          </div>
          {consent.isSuccess && (
            <p className='text-sm text-muted-foreground'>
              Recorded {formatDate(new Date(consent.submittedAt).toISOString())}
            </p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={dialog === 'regenerate'}
        onOpenChange={(open) => !open && setDialog(null)}
        title='Regenerate this link?'
        desc='The link you already sent stops working. Copy and send the new one.'
        confirmText='Regenerate link'
        isLoading={regenerate.isPending}
        handleConfirm={() => regenerate.mutate()}
      />
      <ConfirmDialog
        open={dialog === 'revoke'}
        onOpenChange={(open) => !open && setDialog(null)}
        title='Revoke this link?'
        desc="The client's current link stops working immediately. You can send a new one."
        confirmText='Revoke link'
        destructive
        isLoading={revoke.isPending}
        handleConfirm={() => revoke.mutate()}
      />
    </div>
  )
}
