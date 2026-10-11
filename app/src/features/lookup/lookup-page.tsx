import { useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FlaskConical, Loader2, SearchX } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { unlessHandled } from '@/features/requests/requests-api'
import { ConfirmCards } from './confirm-cards'
import {
  detectLookupType,
  logicsErrorCopy,
  lookup,
  type LookupType,
} from './lookup-api'

const HELPER: Record<LookupType, string> = {
  phone: 'Searching by phone number',
  email: 'Searching by email',
  case_id: 'Searching by case ID',
}
const NOUN: Record<LookupType, string> = {
  phone: 'phone number',
  email: 'email',
  case_id: 'case ID',
}
const INLINE = new Map([
  ['phone_invalid', 'Enter a 10-digit US phone number.'],
  ['email_invalid', "That doesn't look like an email address."],
  ['case_id_invalid', 'Enter a case ID of up to 9 digits.'],
])

// D-15 / LOOK-01: one input; the type is detected as staff type (the Worker re-validates).
export function LookupPage({
  onConfirmed,
}: {
  onConfirmed: (caseId: string) => void
}) {
  const qc = useQueryClient()
  const [value, setValue] = useState('')
  const [lastName, setLastName] = useState('')
  const id = useId()
  const type = detectLookupType(value)
  const search = useMutation({
    mutationFn: (input: Parameters<typeof lookup>[0]) => lookup(input),
    onError: unlessHandled(
      qc,
      (e) => INLINE.has(e.code) || !!logicsErrorCopy(e.code)
    ),
  })

  const code = search.error instanceof ApiError ? search.error.code : ''
  const inline = INLINE.get(code)
  const alert = logicsErrorCopy(code)

  // Old results or errors describe a different value: clear them on any edit.
  function edit(set: (v: string) => void, v: string) {
    set(v)
    search.reset()
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!type || search.isPending) return
    const last = lastName.trim()
    search.mutate({
      type,
      value: value.trim(),
      ...(type === 'phone' && last ? { last_name: last } : {}),
    })
  }

  return (
    <>
      <h1 className='mb-6 text-2xl leading-tight font-semibold'>
        Find a client
      </h1>

      <form noValidate onSubmit={submit} className='mb-6 grid max-w-xl gap-4'>
        <div className='grid gap-2'>
          <Label htmlFor={`${id}-value`} className='font-normal'>
            Case ID, phone, or email
          </Label>
          <Input
            id={`${id}-value`}
            inputMode='search'
            autoComplete='off'
            value={value}
            aria-invalid={inline ? true : undefined}
            aria-describedby={`${id}-helper`}
            onChange={(e) => edit(setValue, e.target.value)}
          />
          <p
            id={`${id}-helper`}
            className={inline ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
          >
            {inline ??
              (type ? HELPER[type] : 'Enter a case ID, a phone number, or an email.')}
          </p>
        </div>

        {type === 'phone' && (
          <div className='grid gap-2'>
            <Label htmlFor={`${id}-last`} className='font-normal'>
              Last name (optional)
            </Label>
            <Input
              id={`${id}-last`}
              autoComplete='off'
              value={lastName}
              onChange={(e) => edit(setLastName, e.target.value)}
            />
          </div>
        )}

        <div className='flex sm:justify-end'>
          <Button
            type='submit'
            className='h-10 w-full sm:w-auto'
            disabled={!type || search.isPending}
          >
            {search.isPending && <Loader2 className='size-4 animate-spin' />}
            {search.isPending ? 'Searching…' : 'Search'}
          </Button>
        </div>
      </form>

      {alert && (
        <Alert variant='destructive' className='mb-6'>
          <AlertTitle className='whitespace-normal'>{alert.title}</AlertTitle>
          <AlertDescription>{alert.body}</AlertDescription>
        </Alert>
      )}

      {search.data && search.variables && (
        <div className='grid gap-4'>
          {/* C1: fixture results must never pass for real clients. */}
          {search.data.mode === 'fake' && (
            <Alert role='status'>
              <FlaskConical />
              <AlertTitle className='whitespace-normal'>
                Using built-in test cases
              </AlertTitle>
              <AlertDescription>
                Lookups use ResSpark's sample cases until the Logics mode is
                switched to live.
              </AlertDescription>
            </Alert>
          )}
          {search.data.results.length > 0 ? (
            <ConfirmCards
              results={search.data.results}
              searchType={search.variables.type}
              onConfirmed={onConfirmed}
            />
          ) : (
            <Card>
              <CardContent className='flex min-h-60 flex-col items-center justify-center gap-2 py-12 text-center'>
                <SearchX
                  className='size-12 text-muted-foreground'
                  aria-hidden='true'
                />
                <h2 className='text-xl leading-tight font-semibold'>
                  No matching case
                </h2>
                <p className='max-w-md text-muted-foreground'>
                  Check the {NOUN[search.variables.type]} and search again, or
                  ask the client for another contact.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  )
}
