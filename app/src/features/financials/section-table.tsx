import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { FinancialsView, RunView } from './api'
import { LineRow } from './line-row'

type Section = FinancialsView['sections'][number]

const num = (v: unknown) => (typeof v === 'number' ? v : null)

// D-14: one collapsible statement section. Expense rows read their standard and allowed amounts from the run.
export function SectionTable({
  caseId,
  view,
  section,
  run,
  children,
}: {
  caseId: string
  view: FinancialsView
  section: Section
  run?: RunView | null
  children?: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  const bodyId = useId()
  const expenses = section.id === 'expenses'
  return (
    <Card data-section={section.id} className='gap-0 py-0'>
      <h2 className='text-lg font-semibold'>
        <button
          type='button'
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
          className='flex w-full items-center gap-2 px-4 py-3 text-left'
        >
          <ChevronDown aria-hidden='true' className={cn('size-4 transition-transform', !open && '-rotate-90')} />
          {section.title}
        </button>
      </h2>
      <CardContent id={bodyId} hidden={!open} className='px-0 pb-2'>
        {children}
        <Table>
          <TableHeader className='bg-muted'>
            <TableRow>
              <TableHead className='w-16'>Line</TableHead>
              <TableHead>Item</TableHead>
              <TableHead className='text-right'>{expenses ? 'Actual' : 'Value'}</TableHead>
              {expenses && <TableHead className='text-right'>IRS standard</TableHead>}
              {expenses && <TableHead className='text-right'>Allowed</TableHead>}
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {section.lines.map((line) => (
              <LineRow
                key={line.column ?? line.allowable_key ?? line.label}
                caseId={caseId}
                line={line}
                view={view}
                standardValue={line.standard_key ? num(run?.standards_inputs[line.standard_key]) : null}
                allowedValue={line.allowable_key ? (run?.allowable_breakdown[line.allowable_key] ?? null) : null}
              />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
