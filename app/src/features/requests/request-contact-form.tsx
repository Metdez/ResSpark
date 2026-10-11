import { useId, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { checkContact, maskEmail, maskPhone } from '@/lib/contact'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { SendErrorExtras } from './requests-api'

const formatPhone = (e164: string) => {
  const d = e164.slice(-10)
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

interface Props {
  caseEmail: string | null
  casePhoneE164: string | null
  pending: boolean
  serverExtras?: SendErrorExtras
  onEdit: () => void
  onSend: (email: string, phone: string, keepFlagged: boolean) => void
}

// D-07: the same checkContact the Worker runs; the Worker stays the authority (T-02-28).
export function RequestContactForm({
  caseEmail,
  casePhoneE164,
  pending,
  serverExtras = {},
  onEdit,
  onSend,
}: Props) {
  const [email, setEmail] = useState(caseEmail ?? '')
  const [phone, setPhone] = useState(
    casePhoneE164 ? formatPhone(casePhoneE164) : ''
  )
  const [keep, setKeep] = useState(false)
  const id = useId()

  const check = checkContact({ email, phone })
  const emailError = check.email_error ?? serverExtras.email_error
  const phoneError = check.phone_error ?? serverExtras.phone_error
  const suggestion = check.email_suggestion ?? serverExtras.email_suggestion
  // A value Logics doesn't have on file differs too, matching the Worker's rule.
  const emailDiffers =
    !!check.email && check.email !== (caseEmail ?? '').toLowerCase()
  const phoneDiffers = !!check.phone_e164 && check.phone_e164 !== casePhoneE164
  const flagged =
    !!suggestion ||
    emailDiffers ||
    phoneDiffers ||
    !!serverExtras.differs?.length
  const canSend = !emailError && !phoneError && (!flagged || keep)

  function edit(set: (v: string) => void, value: string) {
    set(value)
    setKeep(false)
    onEdit()
  }

  const ids = {
    emailError: `${id}-email-error`,
    emailHint: `${id}-email-hint`,
    emailDiffers: `${id}-email-differs`,
    phoneError: `${id}-phone-error`,
    phoneDiffers: `${id}-phone-differs`,
  }
  const describedBy = (pairs: [boolean, string][]) =>
    pairs
      .filter(([on]) => on)
      .map(([, v]) => v)
      .join(' ') || undefined

  return (
    <form
      noValidate
      className='grid gap-4'
      onSubmit={(e) => {
        e.preventDefault()
        if (canSend && !pending) onSend(email, phone, keep)
      }}
    >
      <div className='grid gap-2'>
        <Label htmlFor={`${id}-email`} className='font-normal'>
          Client email
        </Label>
        <Input
          id={`${id}-email`}
          type='email'
          inputMode='email'
          autoComplete='off'
          value={email}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={describedBy([
            [!!emailError, ids.emailError],
            [!!suggestion, ids.emailHint],
            [emailDiffers, ids.emailDiffers],
          ])}
          onChange={(e) => edit(setEmail, e.target.value)}
        />
        {emailError && (
          <p id={ids.emailError} className='text-sm text-destructive'>
            {emailError}
          </p>
        )}
        {suggestion && (
          <p id={ids.emailHint} className='text-sm text-muted-foreground'>
            Did you mean {suggestion}?{' '}
            <Button
              type='button'
              variant='link'
              className='h-auto p-0 text-sm font-normal'
              onClick={() => edit(setEmail, suggestion)}
            >
              Use {suggestion}
            </Button>
          </p>
        )}
        {emailDiffers && (
          <p id={ids.emailDiffers} className='text-sm text-muted-foreground'>
            Differs from Logics (
            {caseEmail ? maskEmail(caseEmail) : 'none on file'})
          </p>
        )}
      </div>

      <div className='grid gap-2'>
        <Label htmlFor={`${id}-phone`} className='font-normal'>
          Client phone
        </Label>
        <Input
          id={`${id}-phone`}
          type='tel'
          inputMode='tel'
          autoComplete='off'
          value={phone}
          aria-invalid={phoneError ? true : undefined}
          aria-describedby={describedBy([
            [!!phoneError, ids.phoneError],
            [phoneDiffers, ids.phoneDiffers],
          ])}
          onChange={(e) => edit(setPhone, e.target.value)}
        />
        {phoneError && (
          <p id={ids.phoneError} className='text-sm text-destructive'>
            {phoneError}
          </p>
        )}
        {phoneDiffers && (
          <p id={ids.phoneDiffers} className='text-sm text-muted-foreground'>
            Differs from Logics (
            {casePhoneE164 ? maskPhone(casePhoneE164) : 'none on file'})
          </p>
        )}
      </div>

      {flagged && (
        <div className='flex items-center gap-2'>
          <Checkbox
            id={`${id}-keep`}
            checked={keep}
            onCheckedChange={(v) => setKeep(v === true)}
          />
          <Label htmlFor={`${id}-keep`} className='font-normal'>
            Use these values anyway
          </Label>
        </div>
      )}

      <div className='flex sm:justify-end'>
        <Button
          type='submit'
          className='h-10 w-full sm:w-auto'
          disabled={!canSend || pending}
        >
          {pending && <Loader2 className='size-4 animate-spin' />}
          {pending ? 'Sending…' : 'Send link'}
        </Button>
      </div>
    </form>
  )
}
