import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { TableCell, TableRow } from '@/components/ui/table'
import type { FinancialsView, LineView } from './api'
import { DecideDialog } from './decide-dialog'
import { formatMoney, formatValue } from './format'
import { SourceBadge, sourceName, StatusChip } from './source-badge'
import { useDecide, type DecideInput } from './use-financials'

const amount = (v: number | null | undefined) => (typeof v === 'number' ? formatMoney(v) : '—')

const valueOf = (view: FinancialsView, column: string): unknown =>
  view.sections.flatMap((s) => s.lines).find((l) => l.column === column)?.value

// D-06: Not applicable is offered only when the view's current facts make the line moot.
const NOT_APPLICABLE: Record<NonNullable<LineView['na_rule']>, (view: FinancialsView) => boolean> = {
  not_married: (view) => valueOf(view, 'filing_status_married') === false,
  owns_home: (view) => valueOf(view, 'owns_home') === true,
  not_wage_earner: (view) => valueOf(view, 'is_wage_earner') === false,
}

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

const Small = (props: React.ComponentProps<typeof Button>) => <Button type='button' size='sm' variant='outline' {...props} />

export function LineRow({
  caseId,
  line,
  view,
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
  const [dialog, setDialog] = useState<'edit' | 'not_applicable' | null>(null)
  const column = line.column
  const busy = decide.isPending
  const act = (body: Omit<DecideInput, 'column'>, onDone?: () => void) =>
    column && decide.mutate({ column, ...body }, { onSuccess: onDone })

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
                <Small
                  aria-label={`Accept ${sourceName(p.source)} value for ${line.label}`}
                  disabled={busy}
                  onClick={() => act({ action: 'accept', proposal_id: p.id })}
                >
                  Accept
                </Small>
                <Small
                  aria-label={`Reject ${sourceName(p.source)} value for ${line.label}`}
                  disabled={busy}
                  onClick={() => act({ action: 'reject', proposal_id: p.id })}
                >
                  Reject
                </Small>
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
      <TableCell className='align-top'>
        {column && (
          <div className='flex flex-wrap justify-end gap-2'>
            <Small aria-label={`Edit ${line.label}`} disabled={busy} onClick={() => setDialog('edit')}>
              Edit
            </Small>
            {(line.kind === 'money' || line.kind === 'count') && (
              <Small aria-label={`Known $0 for ${line.label}`} disabled={busy} onClick={() => act({ action: 'known_zero' })}>
                Known $0
              </Small>
            )}
            {line.value !== null && (
              <Small aria-label={`Mark ${line.label} unknown`} disabled={busy} onClick={() => act({ action: 'unknown' })}>
                Unknown
              </Small>
            )}
            {line.na_rule && NOT_APPLICABLE[line.na_rule](view) && (
              <Small aria-label={`Mark ${line.label} not applicable`} disabled={busy} onClick={() => setDialog('not_applicable')}>
                Not applicable
              </Small>
            )}
          </div>
        )}
        {dialog && (
          <DecideDialog
            mode={dialog}
            line={line}
            pending={busy}
            onClose={() => setDialog(null)}
            onSave={({ value, note }) =>
              act(
                dialog === 'edit'
                  ? { action: 'edit', value, note, ...(line.proposals[0] && { proposal_id: line.proposals[0].id }) }
                  : { action: 'not_applicable', note },
                () => setDialog(null)
              )
            }
          />
        )}
      </TableCell>
    </TableRow>
  )
}
