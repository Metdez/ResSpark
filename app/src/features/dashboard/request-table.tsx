import { useState } from 'react'
import { Link, useSearch } from '@tanstack/react-router'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table'
import { Inbox } from 'lucide-react'
import { requestStatusBadge } from '@/lib/status'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { DashboardRow } from './api'
import { columns } from './columns'
import { useRequests } from './use-requests'

const HEAD = 'sticky top-0 bg-muted px-3 py-2 font-semibold'
const CELL = 'px-3 py-2'
const NO_ROWS: DashboardRow[] = []

function Empty({ q, status }: { q?: string; status?: string }) {
  const heading = q
    ? `No requests match "${q}"`
    : status
      ? `No requests are ${requestStatusBadge(status).label.toLowerCase()}`
      : 'No requests yet'
  return (
    <Card>
      <CardContent className='flex min-h-60 flex-col items-center justify-center gap-2 py-12 text-center'>
        <Inbox className='size-12 text-muted-foreground' aria-hidden='true' />
        <h2 className='text-xl leading-tight font-semibold'>{heading}</h2>
        {q || status ? (
          <p className='max-w-md text-muted-foreground'>
            Try another filter or search.
          </p>
        ) : (
          <>
            <p className='max-w-md text-muted-foreground'>
              Send a client a link to see it here.
            </p>
            <Button asChild className='mt-4'>
              <Link to='/admin/lookup'>Look up a client</Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function RequestTable() {
  const search = useSearch({ from: '/admin/_shell/' })
  const query = useRequests(search)
  const rows = query.data?.requests
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'last_activity_at', desc: true },
  ])
  const table = useReactTable({
    data: rows ?? NO_ROWS,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (r) => r.id,
    enableHiding: false,
  })

  if (query.isError && !rows)
    return (
      <Alert variant='destructive'>
        <AlertTitle className='whitespace-normal'>
          Couldn't load requests.
        </AlertTitle>
        <AlertDescription>
          Check your connection and try again.
          <Button
            variant='outline'
            size='sm'
            className='mt-2'
            onClick={() => void query.refetch()}
          >
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    )

  return (
    <>
      <div className='mb-2 flex min-h-5 items-center gap-4 text-sm text-muted-foreground'>
        {rows && rows.length > 0 && (
          <span>
            {rows.length} request{rows.length === 1 ? '' : 's'}
          </span>
        )}
        {query.isError && (
          <span role='status'>Couldn't refresh — retrying</span>
        )}
      </div>
      {rows?.length === 0 ? (
        <Empty q={search.q} status={search.status} />
      ) : (
        <div className='overflow-x-auto rounded-md border'>
          <Table className='text-sm'>
            <TableHeader>
              {table.getHeaderGroups().map((group) => (
                <TableRow key={group.id} className='hover:bg-transparent'>
                  {group.headers.map((header) => (
                    <TableHead key={header.id} className={HEAD}>
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {rows
                ? table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id} className='h-10 hover:bg-muted/50'>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className={CELL}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : [0, 1, 2].map((i) => (
                    <TableRow key={i} className='h-10'>
                      {columns.map((_, c) => (
                        <TableCell key={c} className={CELL}>
                          <Skeleton className='h-4 w-full' />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}
