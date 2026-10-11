import { ago } from '@/lib/relative-time'
import type { Tone } from '@/lib/status'
import { StatusBadge } from '@/components/status-badge'
import type { CaseAddressView } from './api'

const chip = (a: CaseAddressView): { tone: Tone; label: string } =>
  a.source === 'manual'
    ? { tone: 'warning', label: 'Unverified — county unknown' }
    : a.verified
      ? { tone: 'success', label: 'USPS verified' }
      : { tone: 'warning', label: 'Unverified' }

// D-07: the confirmed address for staff. County is text only; there is no county select (ADDR-01).
export function AddressCard({ address: a }: { address: CaseAddressView | null }) {
  if (!a) return <p className='text-sm text-muted-foreground'>The client hasn't confirmed an address yet.</p>
  const zip = a.zip5 ? (a.zip4 ? `${a.zip5}-${a.zip4}` : a.zip5) : ''
  const cityLine = [a.city, [a.state_code, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  return (
    <div data-address-card className='grid gap-1 rounded-md bg-muted/40 p-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <span className='font-medium'>{a.line1}</span>
        {a.line2 && <span>{a.line2}</span>}
        <StatusBadge {...chip(a)} />
      </div>
      <p>{cityLine}</p>
      {a.source === 'smarty' && a.county_fips && (
        <p>
          {a.county_name} County ({a.county_fips})
        </p>
      )}
      {a.rdi && <p>{a.rdi}</p>}
      {a.source === 'smarty' && !a.verified && (a.dpv === 'D' || a.dpv === 'S') && (
        <p className='text-sm text-muted-foreground'>Unit missing or not recognized</p>
      )}
      <p className='text-sm text-muted-foreground'>
        Source: {a.source === 'smarty' ? 'Smarty' : 'entered by client'} · Confirmed{' '}
        <span title={a.confirmed_at}>{ago(a.confirmed_at)}</span>
      </p>
    </div>
  )
}
