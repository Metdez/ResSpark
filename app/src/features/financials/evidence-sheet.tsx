import { useQuery } from '@tanstack/react-query'
import { GENERIC_ERROR } from '@/lib/handle-server-error'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getEvidence, type EvidenceView } from './api'
import { formatDay, formatMoney } from './format'

export type EvidenceTarget = { column: string; proposalId: string | null }

const MONTH = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const formatMonth = (iso: string) => MONTH.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`))
const Money = ({ value }: { value: number }) => <span className='tabular-nums'>{formatMoney(value)}</span>

function Bank({ view }: { view: Extract<EvidenceView, { kind: 'bank' }> }) {
  const { window: w } = view
  return (
    <div className='grid gap-4'>
      <p className='text-sm text-muted-foreground'>
        Window {formatDay(w.start)} – {formatDay(w.end)} ({w.months} months)
      </p>
      <Table>
        <TableHeader className='bg-muted'>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Account</TableHead>
            <TableHead className='text-right'>Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {view.months.map((m) => (
            <MonthRows key={m.month} month={m} />
          ))}
        </TableBody>
      </Table>
      <p className='flex justify-between font-medium' data-average>
        <span>Monthly average</span>
        <Money value={view.average} />
      </p>
      {view.truncated && (
        <p className='text-sm text-muted-foreground'>Showing the newest 500 transactions. The monthly subtotals include every transaction.</p>
      )}
      {view.cross_check && (
        <p className='text-sm' data-cross-check>
          {view.cross_check.label}: <Money value={view.cross_check.monthly} /> a month
        </p>
      )}
    </div>
  )
}

function MonthRows({ month: m }: { month: Extract<EvidenceView, { kind: 'bank' }>['months'][number] }) {
  return (
    <>
      {m.transactions.map((t) => (
        <TableRow key={t.id}>
          <TableCell className='tabular-nums'>{formatDay(t.date)}</TableCell>
          <TableCell className='whitespace-normal'>{t.merchant_name ?? t.name ?? '—'}</TableCell>
          <TableCell>{t.account}</TableCell>
          <TableCell className='text-right'>
            <Money value={t.amount} />
          </TableCell>
        </TableRow>
      ))}
      <TableRow data-month={m.month} className='bg-muted/50 font-medium'>
        <TableCell colSpan={3}>Subtotal {formatMonth(m.month)}</TableCell>
        <TableCell className='text-right'>
          <Money value={m.subtotal} />
        </TableCell>
      </TableRow>
    </>
  )
}

function Body({ view }: { view: EvidenceView }) {
  switch (view.kind) {
    case 'bank':
      return <Bank view={view} />
    default:
      return <p className='text-sm text-muted-foreground'>No source yet</p>
  }
}

// D-10: the evidence behind one figure, read-only. Staff correct a figure through Edit with a note.
export function EvidenceSheet({
  caseId,
  target,
  onClose,
  returnFocus,
}: {
  caseId: string
  target: EvidenceTarget | null
  onClose: () => void
  returnFocus?: React.RefObject<HTMLElement | null>
}) {
  const evidence = useQuery({
    queryKey: ['evidence', caseId, target?.column, target?.proposalId],
    queryFn: () => getEvidence(caseId, target!.column, target!.proposalId),
    enabled: !!target,
    meta: { errorShown: true },
  })
  const view = evidence.data
  return (
    <Sheet open={!!target} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side='right'
        className='w-full overflow-y-auto sm:max-w-xl'
        // No SheetTrigger here, so Radix cannot restore focus itself: return it to the clicked figure.
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          returnFocus?.current?.focus()
        }}
      >
        <SheetHeader>
          <SheetTitle>{view?.label ?? 'Evidence'}</SheetTitle>
          <SheetDescription>Where this figure comes from. To correct it, close this and use Edit with a note.</SheetDescription>
        </SheetHeader>
        <div className='px-4 pb-6'>
          {evidence.isPending ? (
            <Skeleton className='h-24 w-full' />
          ) : evidence.isError ? (
            <p className='text-sm text-destructive'>{GENERIC_ERROR}</p>
          ) : (
            view && <Body view={view} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
