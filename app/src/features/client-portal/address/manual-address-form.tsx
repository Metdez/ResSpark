import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { US_STATES } from '@/lib/us-states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { confirmAddress, type ConfirmResult } from './address-api'
import { ADDRESS_COPY as T } from './address-copy'

type Fields = { street: string; unit: string; city: string; state: string; zip5: string }
type Errors = Partial<Record<keyof Fields, string>>

const validate = (f: Fields): Errors => {
  const e: Errors = {}
  if (!f.street.trim()) e.street = T.errStreet
  if (!f.city.trim()) e.city = T.errCity
  if (!f.state) e.state = T.errState
  if (!/^\d{5}$/.test(f.zip5)) e.zip5 = T.errZip
  return e
}

// D-06: manual entry, stored unverified with no county. No county field here (ADDR-01).
export function ManualAddressForm({
  itemId,
  notice,
  onSaved,
}: {
  itemId: string
  notice: string | null
  onSaved(r: ConfirmResult): void
}) {
  const [f, setF] = useState<Fields>({ street: '', unit: '', city: '', state: '', zip5: '' })
  const [errors, setErrors] = useState<Errors>({})
  const save = useMutation({
    mutationFn: () =>
      confirmAddress(itemId, {
        source: 'manual',
        street: f.street.trim(),
        ...(f.unit.trim() ? { unit: f.unit.trim() } : {}),
        city: f.city.trim(),
        state: f.state,
        zip5: f.zip5,
      }),
    onSuccess: onSaved,
  })
  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value })
  const field = (k: keyof Fields, label: string, input: React.ReactNode) => (
    <div className='grid gap-1'>
      <label htmlFor={`addr-${k}`} className='text-base font-medium'>
        {label}
      </label>
      {input}
      {errors[k] && (
        <p id={`addr-${k}-error`} className='text-base text-destructive'>
          {errors[k]}
        </p>
      )}
    </div>
  )
  const props = (k: keyof Fields) => ({
    id: `addr-${k}`,
    value: f[k],
    onChange: set(k),
    'aria-invalid': !!errors[k],
    'aria-describedby': errors[k] ? `addr-${k}-error` : undefined,
    className: 'h-11 text-base md:text-base',
  })

  return (
    <form
      noValidate
      className='grid gap-4'
      onSubmit={(e) => {
        e.preventDefault()
        const found = validate(f)
        setErrors(found)
        if (Object.keys(found).length === 0) save.mutate()
      }}
    >
      <h3 className='text-xl leading-tight font-semibold'>{T.manualTitle}</h3>
      {notice && <p className='text-base text-muted-foreground'>{notice}</p>}
      {field('street', T.street, <Input {...props('street')} autoComplete='address-line1' />)}
      {field('unit', T.unit, <Input {...props('unit')} autoComplete='address-line2' />)}
      {field('city', T.city, <Input {...props('city')} autoComplete='address-level2' />)}
      {field(
        'state',
        T.state,
        // A native select: the phone's own picker, 16 px, no portal to test around.
        <select
          {...props('state')}
          autoComplete='address-level1'
          className='h-11 w-full rounded-md border border-input bg-transparent px-3 text-base'
        >
          <option value=''>{T.statePlaceholder}</option>
          {US_STATES.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
      )}
      {field(
        'zip5',
        T.zip,
        <Input {...props('zip5')} autoComplete='postal-code' inputMode='numeric' maxLength={5} />
      )}
      {save.isError && (
        <p role='alert' className='text-base text-destructive'>
          {T.saveFailed}
        </p>
      )}
      <Button type='submit' size='xl' className='w-full' disabled={save.isPending}>
        {save.isPending ? (
          <>
            <Loader2 className='animate-spin' aria-hidden='true' />
            {T.saving}
          </>
        ) : (
          T.manualSave
        )}
      </Button>
    </form>
  )
}
