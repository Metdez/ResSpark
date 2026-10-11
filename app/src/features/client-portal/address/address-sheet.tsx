import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { PortalError, type PortalStep } from '../portal-api'
import { confirmAddress, selectedFor, type AddressSuggestion, type ConfirmResult } from './address-api'
import { ADDRESS_COPY as T } from './address-copy'
import { ManualAddressForm } from './manual-address-form'
import { useAddressSuggest } from './use-address-suggest'

type Mode = 'search' | 'units' | 'confirm' | 'unit' | 'done' | 'manual'

const lineTwo = (s: AddressSuggestion) => `${s.city}, ${s.state} ${s.zipcode}`
const lineOne = (s: AddressSuggestion) => [s.street_line, s.secondary].filter(Boolean).join(' ')

// D-05/D-06: search → (units) → confirm → (unit prompt, once) → done; every failure → manual.
export function AddressSheet({ step, open, onClose }: { step: PortalStep; open: boolean; onClose(): void }) {
  const qc = useQueryClient()
  const [mode, setMode] = useState<Mode>('search')
  const [input, setInput] = useState('')
  const [parent, setParent] = useState<AddressSuggestion | null>(null)
  const [picked, setPicked] = useState<AddressSuggestion | null>(null)
  const [unit, setUnit] = useState('')
  const [unitPrompted, setUnitPrompted] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const selected = mode === 'units' && parent ? selectedFor(parent) : null
  const { suggestions, error } = useAddressSuggest(input, selected, mode === 'search' || mode === 'units')

  const toManual = (n: string | null) => {
    setNotice(n)
    setMode('manual')
  }

  // A suggest error while searching shows the manual form: 503 = no keys, 429 = keep the list,
  // anything else = the one-failure fallback of 06-01. Derived, not stored.
  const lookupNotice =
    !error || (error instanceof PortalError && error.status === 429)
      ? null
      : error instanceof PortalError && error.code === 'provider_not_configured'
        ? T.notConfigured
        : T.lookupFailed
  const view: Mode = lookupNotice && (mode === 'search' || mode === 'units') ? 'manual' : mode

  const saved = (r: ConfirmResult) => {
    void qc.invalidateQueries({ queryKey: ['portal', 'state'] })
    if (r.needs_unit && !unitPrompted) {
      setUnitPrompted(true)
      setMode('unit')
    } else setMode('done')
  }

  const confirm = useMutation({
    mutationFn: (s: AddressSuggestion) =>
      confirmAddress(step.id, {
        source: 'smarty',
        street_line: s.street_line,
        ...(s.secondary ? { secondary: s.secondary } : {}),
        city: s.city,
        state: s.state,
        zipcode: s.zipcode,
      }),
    onSuccess: saved,
    onError: (e) => {
      if (e instanceof PortalError && e.status === 422 && e.code === 'address_unverifiable') toManual(T.unverifiable)
      else toast.error(T.saveFailed)
    },
  })

  const pick = (s: AddressSuggestion) => {
    if (s.entries > 1 && mode === 'search') {
      setParent(s)
      setMode('units')
    } else {
      setPicked(s)
      setMode('confirm')
    }
  }

  const pending = (label: string) =>
    confirm.isPending ? (
      <>
        <Loader2 className='animate-spin' aria-hidden='true' />
        {T.saving}
      </>
    ) : (
      label
    )

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      {/* full dynamic-viewport height with the input at the top, so the phone keyboard never covers it */}
      <SheetContent
        side='bottom'
        className='mx-auto h-dvh max-w-[30rem] gap-0 overflow-y-auto [&>button:last-child]:hidden'
      >
        <SheetHeader className='p-6 pb-2'>
          <SheetTitle className='text-xl leading-tight'>{step.label}</SheetTitle>
          <SheetDescription className='sr-only'>{T.inputLabel}</SheetDescription>
        </SheetHeader>
        <div className='grid gap-4 px-6 pb-6'>
          {(view === 'search' || view === 'units') && (
            <>
              <div className='grid gap-1'>
                <label htmlFor='address-search' className='text-base font-medium'>
                  {T.inputLabel}
                </label>
                <Input
                  id='address-search'
                  autoFocus
                  autoComplete='street-address'
                  inputMode='text'
                  placeholder={T.placeholder}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value)
                    if (mode === 'units') setMode('search')
                  }}
                  className='h-11 text-base md:text-base'
                />
                <p className='text-base text-muted-foreground'>{T.hint}</p>
              </div>
              {view === 'units' && parent && <h3 className='text-base font-semibold'>{T.unitsTitle}</h3>}
              <ul className='grid gap-2'>
                {suggestions.slice(0, 5).map((s, i) => (
                  <li key={`${selectedFor(s)}-${i}`}>
                    <button
                      type='button'
                      data-suggestion
                      onClick={() => pick(s)}
                      className='flex min-h-11 w-full flex-col items-start rounded-md border px-3 py-2 text-start text-base hover:bg-accent'
                    >
                      <span className='font-medium'>{lineOne(s)}</span>
                      <span className='text-muted-foreground'>{lineTwo(s)}</span>
                      {s.entries > 1 && view === 'search' && (
                        <span className='text-muted-foreground'>{T.unitsHint(s.entries)}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              <Button type='button' variant='link' size='xl' className='justify-start px-0' onClick={() => toManual(null)}>
                {T.cantFind}
              </Button>
            </>
          )}

          {view === 'confirm' && picked && (
            <Card>
              <CardContent className='grid gap-4'>
                <h3 className='text-xl leading-tight font-semibold'>{T.confirmTitle}</h3>
                <p className='text-base'>
                  {lineOne(picked)}
                  <br />
                  {lineTwo(picked)}
                </p>
                <Button size='xl' className='w-full' disabled={confirm.isPending} onClick={() => confirm.mutate(picked)}>
                  {pending(T.confirmYes)}
                </Button>
                <Button size='xl' variant='outline' className='w-full' onClick={() => setMode('search')}>
                  {T.confirmNo}
                </Button>
              </CardContent>
            </Card>
          )}

          {view === 'unit' && picked && (
            <form
              className='grid gap-4'
              onSubmit={(e) => {
                e.preventDefault()
                if (unit.trim()) confirm.mutate({ ...picked, secondary: unit.trim() })
              }}
            >
              <p className='text-base font-medium'>{T.unitPrompt}</p>
              <div className='grid gap-1'>
                <label htmlFor='address-unit' className='text-base font-medium'>
                  {T.unitLabel}
                </label>
                <Input
                  id='address-unit'
                  autoComplete='address-line2'
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className='h-11 text-base md:text-base'
                />
              </div>
              <Button type='submit' size='xl' className='w-full' disabled={confirm.isPending}>
                {pending(T.unitSave)}
              </Button>
              <Button type='button' size='xl' variant='outline' className='w-full' onClick={() => setMode('done')}>
                {T.unitSkip}
              </Button>
            </form>
          )}

          {view === 'manual' && <ManualAddressForm itemId={step.id} notice={mode === 'manual' ? notice : lookupNotice} onSaved={saved} />}

          {view === 'done' && <p className='text-base font-medium'>{T.done}</p>}

          <Button type='button' size='xl' variant='outline' className='w-full' onClick={onClose}>
            {T.close}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
