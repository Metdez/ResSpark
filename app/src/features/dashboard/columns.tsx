import { Link } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal } from 'lucide-react'
import { ago } from '@/lib/relative-time'
import { OVERDUE_BADGE, requestStatusBadge } from '@/lib/status'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { DataTableColumnHeader } from '@/components/data-table'
import { StatusBadge } from '@/components/status-badge'
import type { DashboardRow } from './api'

type TimeKey = 'sent_at' | 'opened_at' | 'last_activity_at'

// ISO strings from PostgREST sort chronologically as plain text ('+' sorts below every digit,
// so a shorter fraction compares as zero-padded); 'alphanumeric' would compare fractions numerically.
const timeColumn = (id: TimeKey, title: string): ColumnDef<DashboardRow> => ({
  accessorKey: id,
  sortingFn: 'text',
  header: ({ column }) => (
    <DataTableColumnHeader
      column={column}
      title={title}
      className='justify-end'
    />
  ),
  cell: ({ row }) => {
    const value = row.original[id]
    return (
      <div className='text-right tabular-nums'>
        {value ? <span title={value}>{ago(value)}</span> : '—'}
      </div>
    )
  },
})

export const columns: ColumnDef<DashboardRow>[] = [
  {
    accessorKey: 'client_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Client' />
    ),
    cell: ({ row }) => (
      <Link
        to='/admin/requests/$requestId'
        params={{ requestId: row.original.id }}
        className='text-brand underline underline-offset-4'
      >
        {row.original.client_name}
      </Link>
    ),
  },
  {
    accessorKey: 'template_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Template' />
    ),
  },
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Status' />
    ),
    cell: ({ row }) => (
      <div className='flex flex-wrap gap-1'>
        <StatusBadge {...requestStatusBadge(row.original.status)} />
        {row.original.overdue && <StatusBadge {...OVERDUE_BADGE} />}
      </div>
    ),
  },
  timeColumn('sent_at', 'Sent'),
  timeColumn('opened_at', 'Opened'),
  timeColumn('last_activity_at', 'Last activity'),
  {
    accessorKey: 'agent_display_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Agent' />
    ),
    cell: ({ row }) => row.original.agent_display_name ?? '—',
  },
  {
    id: 'actions',
    enableSorting: false,
    header: () => <span className='sr-only'>Actions</span>,
    cell: ({ row }) => (
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant='ghost'
                size='icon'
                className='size-8'
                aria-label='Actions'
              >
                <MoreHorizontal className='size-4' />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Actions</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem asChild>
            <Link
              to='/admin/requests/$requestId'
              params={{ requestId: row.original.id }}
            >
              Open request
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
]
