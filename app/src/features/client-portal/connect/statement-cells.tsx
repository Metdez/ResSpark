import { Check } from 'lucide-react'
import { monthLabel } from '@/lib/statement-months'
import { Button } from '@/components/ui/button'
import { CONNECT_COPY } from './connect-copy'
import type { ClientConnectionView } from './connection-api'

const T = CONNECT_COPY.bank
type Account = ClientConnectionView['accounts'][number]
export type MonthCell = Account['months'][number]

// D-10: one row per target month, newest first; the bank's gaps become upload buttons.
export function StatementCells({ account, onUploadMonth }: { account: Account; onUploadMonth(cell: MonthCell): void }) {
  const months = [...account.months].sort((a, b) => b.year - a.year || b.month - a.month)
  return (
    <ul className='grid'>
      {months.map((cell) => {
        const label = monthLabel(cell.year, cell.month)
        return (
          <li
            key={`${cell.year}-${cell.month}`}
            data-month-cell={cell.status}
            className='flex min-h-11 flex-wrap items-center gap-3 border-b py-2 last:border-0'
          >
            <span className='min-w-20 flex-1 text-base'>{label}</span>
            {cell.status === 'available' || cell.status === 'manual' ? (
              <span className='flex items-center gap-1 text-base text-emerald-700 dark:text-emerald-300'>
                <Check className='size-4' aria-hidden='true' />
                {T.received}
              </span>
            ) : cell.status === 'pending' ? (
              <span className='text-base text-muted-foreground'>{T.pendingCell}</span>
            ) : (
              <div className='grid w-full gap-1'>
                {cell.status === 'not_supported' && <span className='text-base text-muted-foreground'>{T.notSupported}</span>}
                <Button size='xl' variant='outline' className='h-auto min-h-11 w-full whitespace-normal' onClick={() => onUploadMonth(cell)}>
                  {T.uploadMonth(label, account.mask)}
                </Button>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
