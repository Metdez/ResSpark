import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import { GENERIC_ERROR } from '@/lib/handle-server-error'
import { ago } from '@/lib/relative-time'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/status-badge'
import type { ConnectionSummary } from './api'
import { connectionBadge, transactionsLine } from './connection-status'
import { PayrollPanel } from './payroll-panel'
import { StatementGrid } from './statement-grid'
import { TransactionsTable } from './transactions-table'
import { useRefreshConnection } from './use-connections'

const KIND = { bank: 'Bank', payroll: 'Payroll' } as const
const PROVIDER: Record<string, string> = { plaid: 'Plaid', teller: 'Teller', truv: 'Truv' }

const Stamp = ({ label, iso }: { label: string; iso: string | null }) => (
  <span title={iso ?? undefined}>
    {label} {ago(iso)}
  </span>
)

export function ConnectionCard({ connection: c, requestId }: { connection: ConnectionSummary; requestId: string }) {
  const refresh = useRefreshConnection(requestId)
  const pending = refresh.isPending && refresh.variables === c.id
  const onRefresh = () =>
    refresh.mutate(c.id, {
      onError: (e) => {
        if (!(e instanceof ApiError) || e.status === 401) return
        toast.error(GENERIC_ERROR, { description: <span className='text-sm text-muted-foreground'>{e.code}</span> })
      },
    })

  return (
    <Card data-connection={c.id}>
      <CardContent className='grid gap-3'>
        <div className='flex flex-wrap items-center justify-between gap-4'>
          <div className='flex flex-wrap items-center gap-2'>
            <h3 className='font-semibold'>{KIND[c.kind]}</h3>
            <span className='text-sm text-muted-foreground'>{PROVIDER[c.provider] ?? c.provider}</span>
            <StatusBadge {...connectionBadge(c.status, c.error?.code ?? null)} />
          </div>
          <Button
            type='button'
            variant='outline'
            size='sm'
            aria-label={pending ? 'Refreshing…' : `Refresh ${KIND[c.kind].toLowerCase()} connection`}
            disabled={pending}
            onClick={onRefresh}
          >
            <RefreshCw className='size-4' aria-hidden='true' />
            {pending ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
        <p className='flex flex-wrap gap-x-2 text-sm text-muted-foreground'>
          <Stamp label='Last synced' iso={c.last_polled_at} />
          <span aria-hidden='true'>·</span>
          <Stamp label='Last webhook' iso={c.last_webhook_at} />
          {c.status === 'error' && c.error && (
            <>
              <span aria-hidden='true'>·</span>
              <span>{c.error.code}</span>
            </>
          )}
        </p>
        {c.kind === 'bank' ? (
          <>
            <StatementGrid accounts={c.accounts} />
            <p className='text-sm'>{transactionsLine(c.transactions.count, c.transactions.update_status)}</p>
            <TransactionsTable connectionId={c.id} />
          </>
        ) : (
          <PayrollPanel employers={c.employers} />
        )}
      </CardContent>
    </Card>
  )
}
