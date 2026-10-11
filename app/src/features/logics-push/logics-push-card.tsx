import { useState } from 'react'
import { Upload } from 'lucide-react'
import { GENERIC_ERROR } from '@/lib/handle-server-error'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { PushStatusBadge, StatusBadge } from '@/components/status-badge'
import { useReview } from '@/features/review/use-review'
import type { LedgerPush } from './api'
import { planLabel, pushPlan, sizeLabel, type PushableDoc } from './plan'
import { PushSheet } from './push-sheet'
import { ResolveUnknownDialog } from './resolve-unknown-dialog'
import { latestPushesByDocument, useLedger } from './use-logics-push'

const Heading = () => <h2 className='text-xl leading-tight font-semibold'>Push to Logics</h2>

interface Row extends PushableDoc {
  itemLabel: string
  pushes: LedgerPush[]
  // Latest rows are sent/unknown: the duplicate guard needs "Push again" (PUSH-04).
  done: boolean
  disabled: boolean
}

export function LogicsPushCard({ requestId, caseId }: { requestId: string; caseId: string }) {
  const review = useReview(requestId)
  const ledger = useLedger(requestId)
  const agent = useSession().data?.display_name ?? '…'
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [again, setAgain] = useState<Set<string>>(new Set())
  const [pushing, setPushing] = useState<PushableDoc[] | null>(null)
  const [resolving, setResolving] = useState<LedgerPush | null>(null)

  if (!review.data) {
    return (
      <Card>
        <CardContent className='grid gap-4'>
          <Heading />
          {review.isError ? (
            <p className='text-sm text-destructive'>{GENERIC_ERROR}</p>
          ) : (
            [0, 1, 2].map((i) => <Skeleton key={i} data-skeleton className='h-10 w-full' />)
          )}
        </CardContent>
      </Card>
    )
  }

  const ledgerByDoc = latestPushesByDocument(ledger.data?.batches ?? [])
  const rows: Row[] = review.data.items
    .filter((item) => item.status === 'approved')
    .flatMap((item) =>
      item.documents
        .filter((d) => d.status === 'ready')
        .map((d) => {
          const pushes = ledgerByDoc.get(d.id) ?? []
          const inFlight = pushes.some((p) => p.state === 'queued' || p.state === 'sending')
          const done = !inFlight && pushes.some((p) => p.state === 'sent' || p.state === 'unknown')
          const plan = pushPlan({ mime: d.mime, size_bytes: d.size_bytes, name: d.name })
          const pushAgain = done && again.has(d.id)
          return {
            id: d.id,
            name: d.name,
            size_bytes: d.size_bytes,
            plan,
            pushAgain,
            itemLabel: item.label,
            pushes,
            done,
            disabled: plan.kind === 'manual' || inFlight || (done && !pushAgain),
          }
        })
    )

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className='grid gap-4'>
          <Heading />
          <div className='flex flex-col items-center justify-center gap-2 py-12 text-center'>
            <Upload className='size-12 text-muted-foreground' aria-hidden='true' />
            <h3 className='text-xl leading-tight font-semibold'>Nothing approved yet</h3>
            <p className='max-w-md text-muted-foreground'>Approve an item and its files appear here.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const chosen = rows.filter((r) => selected.has(r.id) && !r.disabled)
  const toggle = (set: Set<string>, id: string, on: boolean) => {
    const next = new Set(set)
    if (on) next.add(id)
    else next.delete(id)
    return next
  }
  const live = ledger.data?.mode === 'live'
  const groups = [...new Set(rows.map((r) => r.itemLabel))]

  return (
    <Card>
      <CardContent className='grid gap-4'>
        <Heading />
        {ledger.isError && (
          <p className='text-sm text-destructive' role='alert'>
            Couldn't load what was already pushed. {GENERIC_ERROR}{' '}
            <Button type='button' variant='link' size='sm' className='h-auto p-0' onClick={() => void ledger.refetch()}>
              Retry
            </Button>
          </p>
        )}
        {groups.map((label) => (
          <section key={label} className='grid'>
            <h3 className='text-sm text-muted-foreground'>{label}</h3>
            {rows
              .filter((r) => r.itemLabel === label)
              .map((r) => (
                <DocRow
                  key={r.id}
                  row={r}
                  checked={selected.has(r.id) && !r.disabled}
                  onCheck={(on) => setSelected((s) => toggle(s, r.id, on))}
                  onAgain={(on) => setAgain((s) => toggle(s, r.id, on))}
                  onResolve={setResolving}
                />
              ))}
          </section>
        ))}
        <div className='flex justify-end'>
          <Button type='button' disabled={chosen.length === 0 || !ledger.data} onClick={() => setPushing(chosen)}>
            {live ? 'Push to Logics' : 'Push to Logics (simulated)'}
          </Button>
        </div>
      </CardContent>
      {pushing && (
        <PushSheet
          open
          onOpenChange={(open) => !open && setPushing(null)}
          requestId={requestId}
          caseId={caseId}
          agentName={agent}
          mode={live ? 'live' : 'fake'}
          selected={pushing}
          onDone={() => {
            setPushing(null)
            setSelected(new Set())
            setAgain(new Set())
          }}
        />
      )}
      <ResolveUnknownDialog
        key={resolving?.id}
        push={resolving}
        onOpenChange={(open) => !open && setResolving(null)}
        requestId={requestId}
        caseId={caseId}
        allowMarkSent={resolving?.state === 'unknown'}
      />
    </Card>
  )
}

function DocRow({
  row: r,
  checked,
  onCheck,
  onAgain,
  onResolve,
}: {
  row: Row
  checked: boolean
  onCheck(on: boolean): void
  onAgain(on: boolean): void
  onResolve(push: LedgerPush): void
}) {
  return (
    <div data-push-row={r.id} className='flex min-h-10 flex-wrap items-center gap-x-4 gap-y-1 py-1'>
      <Checkbox
        aria-label={`Select ${r.name}`}
        checked={checked}
        disabled={r.disabled}
        onCheckedChange={(v) => onCheck(v === true)}
      />
      <span className='max-w-64 truncate text-primary' title={r.name}>
        {r.name}
      </span>
      <span className='text-sm text-muted-foreground tabular-nums'>{sizeLabel(r.size_bytes)}</span>
      <span className={cn('text-sm', r.plan.kind === 'manual' ? 'text-destructive' : 'text-muted-foreground')}>
        {planLabel(r.plan)}
      </span>
      {r.pushes.map((p) => (
        <PushChip key={p.id} push={p} onResolve={onResolve} />
      ))}
      {r.pushes.some((p) => p.mode === 'fake') && <StatusBadge tone='muted' label='Simulated' />}
      {r.done && (
        <span className='flex items-center gap-2 text-sm text-muted-foreground'>
          Already pushed
          <label className='flex items-center gap-1'>
            <Checkbox
              aria-label={`Push ${r.name} again`}
              checked={r.pushAgain}
              onCheckedChange={(v) => onAgain(v === true)}
            />
            Push again
          </label>
        </span>
      )}
    </div>
  )
}

function PushChip({ push: p, onResolve }: { push: LedgerPush; onResolve(push: LedgerPush): void }) {
  const part = p.part_count !== null && p.part_count > 1 ? `part ${p.part_index + 1} of ${p.part_count}` : null
  return (
    <span data-push-chip={p.id} className='flex flex-wrap items-center gap-2 text-sm'>
      {part && <span className='text-muted-foreground'>{part}</span>}
      {p.state === 'unknown' ? (
        <button
          type='button'
          className='rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'
          onClick={() => onResolve(p)}
        >
          <PushStatusBadge state='unknown' label='Needs your decision' />
        </button>
      ) : (
        <PushStatusBadge state={p.state} />
      )}
      {p.state === 'sent' && (
        <span className='text-muted-foreground tabular-nums'>
          {p.logics_document_id !== null ? `#${p.logics_document_id}` : 'Confirmed by staff'}
        </span>
      )}
      {p.state === 'failed' && p.error_detail && <span className='text-destructive'>{p.error_detail}</span>}
      {p.state === 'failed' &&
        (p.needs_manual_compression ? (
          <span className='text-muted-foreground'>Compress it outside ResSpark and re-upload to the item</span>
        ) : (
          <Button type='button' variant='link' size='sm' className='h-auto p-0' onClick={() => onResolve(p)}>
            Re-send
          </Button>
        ))}
    </span>
  )
}
