import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { GENERIC_ERROR } from '@/lib/handle-server-error'
import { ago } from '@/lib/relative-time'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { formatMoney } from './money'
import { useTransactions } from './use-connections'

const humanize = (category: string | null) => {
  if (!category) return '—'
  const text = category.toLowerCase().replace(/_/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const WINDOWS = [
  { months: 6, label: 'Last 6 months' },
  { months: 3, label: 'Last 3 months' },
] as const

function Rows({ connectionId, months }: { connectionId: string; months: 3 | 6 }) {
  const q = useTransactions(connectionId, months, true)
  if (q.isError) {
    return (
      <p className='text-sm text-destructive' role='alert'>
        {GENERIC_ERROR}{' '}
        {q.error instanceof ApiError && <span className='text-sm text-muted-foreground'>{q.error.code}</span>}
      </p>
    )
  }
  if (!q.data) return [0, 1, 2].map((i) => <Skeleton key={i} data-skeleton className='h-10 w-full' />)
  const { transactions, total } = q.data
  if (transactions.length === 0) return <p className='text-sm text-muted-foreground'>No transactions yet</p>
  return (
    <>
      {/* The outer box scrolls so the sticky header works; the shadcn container would otherwise own the scroll. */}
      <div className='max-h-96 overflow-auto rounded-md border [&_[data-slot=table-container]]:overflow-visible'>
        <Table>
          <TableHeader className='sticky top-0 z-10 bg-background'>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className='text-end'>Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((t) => (
              <TableRow key={t.id} data-transaction={t.id} className='h-10'>
                <TableCell className='whitespace-nowrap text-muted-foreground' title={t.date}>
                  {ago(t.date)}
                </TableCell>
                <TableCell className='max-w-64 truncate'>
                  {t.merchant_name ?? t.name ?? '—'}{' '}
                  {t.pending && <StatusBadge tone='neutral' label='Pending' />}
                </TableCell>
                <TableCell className='text-muted-foreground'>{humanize(t.category_primary)}</TableCell>
                <TableCell className='text-end tabular-nums'>{formatMoney(t.amount, t.iso_currency_code)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {/* shortcut: the server caps the list at 1000 rows; add paging when a real case exceeds it. */}
      <p className='text-sm text-muted-foreground'>
        Showing {transactions.length} of {total}
      </p>
    </>
  )
}

export function TransactionsTable({ connectionId }: { connectionId: string }) {
  const [open, setOpen] = useState(false)
  const [months, setMonths] = useState<3 | 6>(6)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className='grid gap-2'>
      <CollapsibleTrigger asChild>
        <Button type='button' variant='ghost' size='sm' className='justify-start px-0'>
          <ChevronDown className={open ? 'size-4 rotate-180' : 'size-4'} aria-hidden='true' />
          Transactions
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className='grid gap-2'>
        <div className='flex gap-2'>
          {WINDOWS.map((w) => (
            <Button
              key={w.months}
              type='button'
              variant='outline'
              size='sm'
              aria-pressed={months === w.months}
              className={months === w.months ? 'bg-accent' : undefined}
              onClick={() => setMonths(w.months)}
            >
              {w.label}
            </Button>
          ))}
        </div>
        {open && <Rows connectionId={connectionId} months={months} />}
      </CollapsibleContent>
    </Collapsible>
  )
}
