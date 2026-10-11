import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { documentUrl } from '../api'
import type { EmployerView } from './api'
import { employerBadge, employerCounts } from './connection-status'
import { openSigned } from './open-signed'

const TYPE_LABEL: Record<string, string> = {
  pay_stub: 'Pay stub',
  w2: 'W-2',
  income_report: 'Income report',
  form_1099: '1099',
  other: 'Document',
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
          {e.documents.length > 0 && (
            <ul className='grid gap-1'>
              {e.documents.map((d) => (
                <li key={d.id}>
                  <Button
                    type='button'
                    variant='link'
                    size='sm'
                    className='h-auto p-0'
                    onClick={() => void openSigned(documentUrl(d.id, 'inline'))}
                  >
                    <ExternalLink className='size-4' aria-hidden='true' />
                    {TYPE_LABEL[d.document_type] ?? 'Document'} · {d.name}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}
