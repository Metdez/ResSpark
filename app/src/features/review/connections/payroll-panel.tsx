import type { ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { formatDay, formatMoney } from '@/features/financials/format'
import { documentUrl } from '../api'
import type { EmployerView, PayStubRow } from './api'
import { employerBadge, employerCounts } from './connection-status'
import { openSigned } from './open-signed'

const TYPE_LABEL: Record<string, string> = {
  pay_stub: 'Pay stub',
  w2: 'W-2',
  income_report: 'Income report',
  form_1099: '1099',
  other: 'Document',
}

// Pay amounts are plain income figures, so they use the unsigned financials formatter, not the Plaid-signed money.ts one.
const money = (n: number | null) => (n === null ? '—' : formatMoney(n))
const total = (rows: PayStubRow[], key: 'gross_pay' | 'net_pay') => rows.reduce((sum, r) => sum + (r[key] ?? 0), 0)
const summary = (rows: PayStubRow[]) =>
  `${rows.length} pay ${rows.length === 1 ? 'stub' : 'stubs'} · gross ${formatMoney(total(rows, 'gross_pay'))} · net ${formatMoney(total(rows, 'net_pay'))}`

// Same signed-URL route the Phase 3 review panel uses; never a second copy of the file (D-06, D-09).
function DocLink({ id, children }: { id: string; children: ReactNode }) {
  return (
    <Button type='button' variant='link' size='sm' className='h-auto p-0' onClick={() => void openSigned(documentUrl(id, 'inline'))}>
      <ExternalLink className='size-4' aria-hidden='true' />
      {children}
    </Button>
  )
}

// Oct 12 call (G): staff compare pay stubs the way they compare bank months, so a change in income shows at a glance.
function RecentPay({ rows }: { rows: PayStubRow[] }) {
  return (
    <div className='grid gap-1' data-recent-pay>
      <p className='text-sm font-medium'>Last 3 months</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Pay date</TableHead>
            <TableHead className='text-end'>Gross</TableHead>
            <TableHead className='text-end'>Net</TableHead>
            <TableHead className='text-end'>
              <span className='sr-only'>Pay stub</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={`${r.pay_date}-${i}`} data-pay-date={r.pay_date}>
              <TableCell>{formatDay(r.pay_date)}</TableCell>
              <TableCell className='text-end tabular-nums'>{money(r.gross_pay)}</TableCell>
              <TableCell className='text-end tabular-nums'>{money(r.net_pay)}</TableCell>
              <TableCell className='text-end'>{r.document_id && <DocLink id={r.document_id}>Stub</DocLink>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className='text-sm text-muted-foreground'>{summary(rows)}</p>
    </div>
  )
}

export function PayrollPanel({ employers }: { employers: EmployerView[] }) {
  if (employers.length === 0) return <p className='text-sm text-muted-foreground'>No employers yet</p>
  return (
    <div className='grid gap-3'>
      {employers.map((e) => (
        <section key={e.employer_id} data-employer={e.employer_id} className='grid gap-2 rounded-lg border p-4'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='font-medium'>{e.company_name ?? 'Employer'}</span>
            <StatusBadge {...employerBadge(e.status)} />
            <span className='text-sm text-muted-foreground'>{employerCounts(e)}</span>
          </div>
          {e.recent_pay.length > 0 && <RecentPay rows={e.recent_pay} />}
          {e.documents.length > 0 && (
            <ul className='grid gap-1'>
              {e.documents.map((d) => (
                <li key={d.id}>
                  <DocLink id={d.id}>
                    {TYPE_LABEL[d.document_type] ?? 'Document'} · {d.name}
                  </DocLink>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}
