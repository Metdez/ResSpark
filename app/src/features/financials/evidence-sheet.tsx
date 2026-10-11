import { useQuery } from '@tanstack/react-query'
import { GENERIC_ERROR } from '@/lib/handle-server-error'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate } from '@/features/requests/requests-api'
import { getEvidence, type EvidenceView, type LineKind } from './api'
import { formatDay, formatMoney, formatValue } from './format'

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

type Of<K extends EvidenceView['kind']> = Extract<EvidenceView, { kind: K }>

// Label/value pairs for the single-fact kinds.
function Facts({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className='grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm'>
      {rows.map(([term, value]) => (
        <div key={term} className='contents'>
          <dt className='text-muted-foreground'>{term}</dt>
          <dd className='whitespace-pre-wrap'>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

// A new tab without an opener: the signed URL is a bearer link for 5 minutes (Phase 3 D-05).
const External = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target='_blank' rel='noopener noreferrer' className='text-primary underline underline-offset-4'>
    {children}
  </a>
)

function Payroll({ view, kind }: { view: Of<'payroll'>; kind: LineKind }) {
  return (
    <div className='grid gap-4'>
      {view.window.start && (
        <p className='text-sm text-muted-foreground'>
          Window {formatDay(view.window.start)} – {formatDay(view.window.end)}
        </p>
      )}
      <Table>
        <TableHeader className='bg-muted'>
          <TableRow>
            <TableHead>Pay date</TableHead>
            <TableHead>Employer</TableHead>
            <TableHead className='text-right'>Gross</TableHead>
            <TableHead>Frequency</TableHead>
            <TableHead>Stub</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {view.stubs.map((s, i) => (
            <TableRow key={`${s.pay_date}-${i}`} data-stub={s.pay_date}>
              <TableCell className='tabular-nums'>{formatDay(s.pay_date)}</TableCell>
              <TableCell className='whitespace-normal'>{s.employer ?? '—'}</TableCell>
              <TableCell className='text-right'>{s.gross === null ? '—' : <Money value={s.gross} />}</TableCell>
              <TableCell>{s.frequency ?? '—'}</TableCell>
              <TableCell>{s.document_url ? <External href={s.document_url}>Open pay stub</External> : <span className='text-muted-foreground'>No PDF</span>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {view.formula.map((f, i) => (
        <p key={i} className='text-sm' data-formula>
          {f.employer ?? 'Employer'}: <Money value={f.sum} /> over {f.stubs} stubs × {f.periods_per_year} pay periods a year ÷ 12 = <Money value={f.monthly} /> a month
        </p>
      ))}
      <p className='flex justify-between font-medium' data-value>
        <span>Proposed value</span>
        <span className='tabular-nums'>{formatValue(kind, view.value)}</span>
      </p>
      <p className='text-sm text-muted-foreground'>Method: {view.method}</p>
      {view.cross_check && (
        <p className='text-sm' data-cross-check>
          {view.cross_check.label}: <Money value={view.cross_check.monthly} /> a month
        </p>
      )}
    </div>
  )
}

function Balances({ view }: { view: Of<'balances'> }) {
  return (
    <Table>
      <TableHeader className='bg-muted'>
        <TableRow>
          <TableHead>Account</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className='text-right'>Balance</TableHead>
          <TableHead>As of</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {view.accounts.map((a) => (
          <TableRow key={a.id} data-account={a.id}>
            <TableCell>{a.account}</TableCell>
            <TableCell>{[a.type, a.subtype].filter(Boolean).join(' · ') || '—'}</TableCell>
            <TableCell className='text-right'>{a.balance_current === null ? '—' : <Money value={a.balance_current} />}</TableCell>
            <TableCell>{a.balance_as_of ? formatDate(a.balance_as_of) : '—'}</TableCell>
          </TableRow>
        ))}
        <TableRow className='bg-muted/50 font-medium' data-total>
          <TableCell colSpan={2}>Total</TableCell>
          <TableCell className='text-right'>
            <Money value={view.total} />
          </TableCell>
          <TableCell />
        </TableRow>
      </TableBody>
    </Table>
  )
}

function Address({ view }: { view: Of<'address'> }) {
  const a = view.address
  const cityLine = [a.city, [a.state_code, a.zip5].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const lines = [a.line1, a.line2, cityLine].filter(Boolean).join('\n')
  return (
    <Facts
      rows={[
        ['Address', lines || 'Not stored'],
        ['County', view.county ?? '—'],
        ['FIPS', view.fips ?? '—'],
        ['Source', view.source ?? '—'],
      ]}
    />
  )
}

function Body({ view, kind }: { view: EvidenceView; kind: LineKind }) {
  switch (view.kind) {
    case 'bank':
      return <Bank view={view} />
    case 'balances':
      return <Balances view={view} />
    case 'payroll':
      return <Payroll view={view} kind={kind} />
    case 'intake':
      return <Facts rows={[['Question', view.prompt], ['Answer', formatValue(kind, view.answer)], ['Answered', formatDate(view.answered_at)]]} />
    case 'logics':
      return <Facts rows={[['Logics field', view.field], ['Value', formatValue(kind, view.value)], ['Fetched', formatDate(view.fetched_at)]]} />
    case 'address':
      return <Address view={view} />
    case 'staff':
      return (
        <Facts
          rows={[
            ['Entered by', view.by_name ?? 'Staff'],
            ['When', view.at ? formatDate(view.at) : '—'],
            ['Note', view.note ?? '—'],
            ['Value', formatValue(kind, view.value)],
          ]}
        />
      )
    case 'document':
      return (
        <ul className='grid gap-2 text-sm'>
          {view.documents.map((d) => (
            <li key={d.id}>{d.url ? <External href={d.url}>{`Open ${d.name}`}</External> : d.name}</li>
          ))}
        </ul>
      )
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
  kind = 'text',
}: {
  caseId: string
  target: EvidenceTarget | null
  onClose: () => void
  returnFocus?: React.RefObject<HTMLElement | null>
  kind?: LineKind
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
            view && <Body view={view} kind={kind} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
