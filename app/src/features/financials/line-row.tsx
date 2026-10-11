import { Button } from '@/components/ui/button'
import { TableCell, TableRow } from '@/components/ui/table'
import type { FinancialsView, LineView } from './api'
import { formatMoney, formatValue } from './format'
import { SourceBadge, sourceName, StatusChip } from './source-badge'
import { useDecide } from './use-financials'

const amount = (v: number | null | undefined) => (typeof v === 'number' ? formatMoney(v) : '—')

function Caption({ line }: { line: LineView }) {
  const c = line.confirmed
  if (!c) return null
  const text =
    line.status === 'edited'
      ? `Edited by ${c.by_name ?? 'staff'}`
      : c.source
        ? `Confirmed · from ${sourceName(c.source)}`
        : 'Confirmed'
  return <p className='text-sm text-muted-foreground'>{text}</p>
}

export function LineRow({
  caseId,
  line,
  standardValue,
  allowedValue,
}: {
  caseId: string
  line: LineView
  view: FinancialsView
  standardValue?: number | null
  allowedValue?: number | null
}) {
  const decide = useDecide(caseId)
  const column = line.column
  return (
    <TableRow data-line={column ?? line.allowable_key}>
      <TableCell className='w-16 align-top text-muted-foreground tabular-nums'>{line.line ?? ''}</TableCell>
      <TableCell className='align-top whitespace-normal'>
        <div>{line.label}</div>
        <Caption line={line} />
        {column && line.proposals.length > 0 && (
          <div className='mt-2 flex flex-wrap gap-2'>
            {line.proposals.map((p) => (
              <div key={p.id} data-proposal={p.id} className='flex items-center gap-2 rounded-md border px-2 py-1'>
                <span className='tabular-nums'>{formatValue(line.kind, p.proposed_value)}</span>
                <SourceBadge source={p.source} />
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  aria-label={`Accept ${sourceName(p.source)} value for ${line.label}`}
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ column, action: 'accept', proposal_id: p.id })}
                >
                  Accept
                </Button>
              </div>
            ))}
          </div>
        )}
      </TableCell>
      <TableCell className='text-right align-top tabular-nums' data-value>
        {column ? formatValue(line.kind, line.value) : '—'}
      </TableCell>
      {line.section === 'expenses' && (
        <>
          <TableCell className='text-right align-top tabular-nums'>{amount(standardValue)}</TableCell>
          <TableCell className='text-right align-top tabular-nums'>{amount(allowedValue)}</TableCell>
        </>
      )}
      <TableCell className='align-top'>
        <StatusChip status={line.status} />
      </TableCell>
    </TableRow>
  )
}
