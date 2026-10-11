import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { requestStatusBadge } from '@/lib/status'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DASHBOARD_STATUSES, type DashboardStatus } from './api'

export const STATUS_CHIPS: Array<{
  value: DashboardStatus | 'all'
  label: string
}> = [
  { value: 'all', label: 'All' },
  ...DASHBOARD_STATUSES.map((value) => ({
    value,
    label: requestStatusBadge(value).label,
  })),
]

export function Filters() {
  const search = useSearch({ from: '/admin/_shell/' })
  const navigate = useNavigate({ from: '/admin/_shell/' })
  // shortcut: the box is not re-synced when q changes via back/forward; add a sync effect if staff report it.
  const [text, setText] = useState(search.q ?? '')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const active = search.status ?? 'all'
  const onSearch = (value: string) => {
    setText(value)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      void navigate({
        to: '.',
        search: (s) => ({ ...s, q: value.trim() || undefined }),
        replace: true,
      })
    }, 300)
  }

  return (
    <div className='mb-4 flex flex-wrap items-center gap-2'>
      {STATUS_CHIPS.map((chip) => (
        <Button
          key={chip.value}
          variant={active === chip.value ? 'secondary' : 'outline'}
          size='sm'
          aria-pressed={active === chip.value}
          onClick={() =>
            void navigate({
              to: '.',
              search: (s) => ({
                ...s,
                status: chip.value === 'all' ? undefined : chip.value,
              }),
            })
          }
        >
          {chip.label}
        </Button>
      ))}
      <Input
        type='search'
        aria-label='Search name or email'
        placeholder='Search name or email'
        className='ms-auto w-full sm:w-64'
        maxLength={64}
        value={text}
        onChange={(e) => onSearch(e.target.value)}
      />
    </div>
  )
}
