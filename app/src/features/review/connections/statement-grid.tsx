import { monthLabel, targetMonths } from '@/lib/statement-months'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { documentUrl } from '../api'
import type { AccountSummary } from './api'
import { cellBadge } from './connection-status'
import { openSigned } from './open-signed'

const LEGEND = ['available', 'manual', 'generated', 'not_supported', 'missing', 'pending']

function Cell({ status, documentId, label }: { status: string; documentId: string | null; label: string }) {
  // A month the bank could not provide may still carry a ResSpark-generated transaction statement.
  const generated = documentId !== null && (status === 'not_supported' || status === 'missing')
  const badge = <StatusBadge {...cellBadge(generated ? 'generated' : status)} />
  if (!documentId || (status !== 'available' && status !== 'manual' && !generated)) return badge
  return (
    <Button
      type='button'
      variant='ghost'
      size='sm'
      className='h-auto p-0'
      aria-label={`Open ${label} ${status === 'available' ? 'statement' : generated ? 'transactions' : 'upload'}`}
      onClick={() => void openSigned(documentUrl(documentId, 'inline'))}
    >
      {badge}
    </Button>
  )
}

// Columns are the six full months before `now`, newest first; the first three are the standard packet.
export function StatementGrid({ accounts, now = new Date() }: { accounts: AccountSummary[]; now?: Date }) {
  if (accounts.length === 0) return <p className='text-sm text-muted-foreground'>No accounts yet</p>
  const months = targetMonths(now, 6)
  return (
    <div className='grid gap-2'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead rowSpan={2}>Account</TableHead>
            <TableHead colSpan={3} className='text-center'>
              Last 3 months
            </TableHead>
            <TableHead colSpan={3} className='border-s text-center'>
              Months 4–6
            </TableHead>
          </TableRow>
          <TableRow>
            {months.map((m, i) => (
              <TableHead key={`${m.year}-${m.month}`} className={i === 3 ? 'border-s' : undefined}>
                {monthLabel(m.year, m.month)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((a) => (
            <TableRow key={a.id} data-account={a.id} className='h-10'>
              <TableCell className='font-medium whitespace-nowrap'>
                {a.name ?? 'Account'}
                {a.mask && ` ••${a.mask}`}
              </TableCell>
              {months.map((m, i) => {
                const cell = a.months.find((c) => c.year === m.year && c.month === m.month)
                return (
                  <TableCell key={`${m.year}-${m.month}`} className={i === 3 ? 'border-s' : undefined}>
                    <Cell
                      status={cell?.status ?? 'missing'}
                      documentId={cell?.document_id ?? null}
                      label={monthLabel(m.year, m.month)}
                    />
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className='flex flex-wrap gap-2' aria-label='Legend'>
        {LEGEND.map((s) => (
          <StatusBadge key={s} {...cellBadge(s)} />
        ))}
      </div>
    </div>
  )
}
