import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Inbox } from 'lucide-react'
import { GENERIC_ERROR } from '@/lib/handle-server-error'
import { requestStatusBadge } from '@/lib/status'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { listRequests, type RequestListRow } from './requests-api'

const RTF = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' })
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 86400],
  ['month', 30 * 86400],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
]

// UI-SPEC dense tables: relative time in the largest unit that fits; callers put the ISO in `title`.
export function relativeTime(iso: string, now = Date.now()): string {
  const seconds = (Date.parse(iso) - now) / 1000
  const [unit, size] = UNITS.find(([, s]) => Math.abs(seconds) >= s) ?? [
    'second',
    1,
  ]
  return RTF.format(Math.round(seconds / size), unit)
}

const COLUMNS = ['Client', 'Status', 'Sent', 'Expires']
const HEAD = 'sticky top-0 bg-muted px-3 py-2 font-semibold'
const CELL = 'px-3 py-2'

const Time = ({ iso }: { iso: string | null }) =>
  iso ? <span title={iso}>{relativeTime(iso)}</span> : <>—</>

function Rows({ rows }: { rows: RequestListRow[] }) {
  return rows.map((r) => (
    <TableRow key={r.id} className='h-10 hover:bg-muted/50'>
      <TableCell className={CELL}>
        <Link
          to='/admin/requests/$requestId'
          params={{ requestId: r.id }}
          className='text-brand underline underline-offset-4'
        >
          {r.client_name}
        </Link>
      </TableCell>
      <TableCell className={CELL}>
        <StatusBadge {...requestStatusBadge(r.status)} />
      </TableCell>
      <TableCell className={CELL}>
        <Time iso={r.sent_at} />
      </TableCell>
      <TableCell className={CELL}>
        <Time iso={r.expires_at} />
      </TableCell>
    </TableRow>
  ))
}

function SkeletonRows() {
  return [0, 1, 2].map((i) => (
    <TableRow key={i} className='h-10'>
      {COLUMNS.map((c) => (
        <TableCell key={c} className={CELL}>
          <Skeleton className='h-4 w-full' />
        </TableCell>
      ))}
    </TableRow>
  ))
}

function Empty() {
  return (
    <Card>
      <CardContent className='flex min-h-60 flex-col items-center justify-center gap-2 py-12 text-center'>
        <Inbox className='size-12 text-muted-foreground' aria-hidden='true' />
        <h2 className='text-xl leading-tight font-semibold'>
          Nothing to do yet
        </h2>
        <p className='max-w-md text-muted-foreground'>
          Requests you send to clients will show up here with their status, who
          they're waiting on, and how long they've been open.
        </p>
        <Button asChild className='mt-4'>
          <Link to='/admin/lookup'>Find a client</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

export function RequestsListPage() {
  const list = useQuery({ queryKey: ['requests'], queryFn: listRequests })
  const rows = list.data?.requests

  let body: React.ReactNode
  if (list.isError)
    body = (
      <Alert variant='destructive'>
        <AlertTitle className='whitespace-normal'>
          Couldn't load requests
        </AlertTitle>
        <AlertDescription>{GENERIC_ERROR}</AlertDescription>
      </Alert>
    )
  else if (rows?.length === 0) body = <Empty />
  else
    body = (
      <Table className='text-sm'>
        {rows && (
          <TableCaption>
            {rows.length} request{rows.length === 1 ? '' : 's'}
          </TableCaption>
        )}
        <TableHeader>
          <TableRow className='hover:bg-transparent'>
            {COLUMNS.map((c) => (
              <TableHead key={c} className={HEAD}>
                {c}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>{rows ? <Rows rows={rows} /> : <SkeletonRows />}</TableBody>
      </Table>
    )

  return (
    <>
      <h1 className='mb-6 text-2xl leading-tight font-semibold'>Requests</h1>
      {body}
    </>
  )
}
