import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import { GENERIC_ERROR } from '@/lib/handle-server-error'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { PUSH_ERROR_COPY, type PushMode } from './api'
import { planLabel, sizeLabel, type PushableDoc } from './plan'
import { useCreatePush } from './use-logics-push'

// logics_write_blocked carries a Worker sentence that names the case; every other code uses our copy.
function errorText(e: Error | null): string | null {
  if (!e) return null
  if (!(e instanceof ApiError)) return GENERIC_ERROR
  return e.code === 'logics_write_blocked' ? e.message : (PUSH_ERROR_COPY[e.code] ?? GENERIC_ERROR)
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className='grid gap-1'>
    <h3 className='font-medium'>{title}</h3>
    {children}
  </section>
)

export function PushSheet({
  open,
  onOpenChange,
  requestId,
  caseId,
  agentName,
  mode,
  selected,
  onDone,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  requestId: string
  caseId: string
  agentName: string
  mode: PushMode
  selected: PushableDoc[]
  onDone(): void
}) {
  const push = useCreatePush(requestId, caseId)
  const live = mode === 'live'
  const sendable = selected.filter((d) => d.plan.kind !== 'manual')
  // The note preview uses the estimate; the consumer writes the real part count (D-07).
  const noteFiles = sendable.flatMap(({ name, plan }) => {
    if (plan.kind !== 'split') return [name]
    const m = plan.estimatedParts
    return Array.from({ length: m }, (_, i) => `${name} (part ${i + 1} of ${m})`)
  })
  const error = errorText(push.error)
  const n = sendable.length

  const confirm = () =>
    push.mutate(
      { document_ids: sendable.map((d) => d.id) },
      {
        onSuccess: () => {
          toast.success('Push started')
          onDone()
        },
      }
    )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side='right' className='overflow-y-auto sm:max-w-lg'>
        <SheetHeader>
          <SheetTitle>{live ? 'Push to Logics' : 'Push to Logics (simulated)'}</SheetTitle>
          <SheetDescription>Review what will land in the Logics case.</SheetDescription>
        </SheetHeader>
        <div className='grid gap-6 px-4'>
          {live && <p className='font-medium'>This will write to the Logics case.</p>}
          <Section title='Files'>
            <ul className='grid gap-1 text-sm'>
              {selected.map((d) => (
                <li key={d.id} data-sheet-row={d.id} className={d.plan.kind === 'manual' ? 'text-destructive' : undefined}>
                  {`${d.name} · ${sizeLabel(d.size_bytes)} · ${planLabel(d.plan)}`}
                  {d.plan.kind === 'manual' && <span className='font-medium'> · Won't be sent</span>}
                </li>
              ))}
            </ul>
          </Section>
          <Section title='Comment'>
            <ul className='grid gap-1 text-sm text-muted-foreground'>
              {sendable.map((d) => (
                <li key={d.id}>{`Uploaded via ResSpark by ${agentName} — ${d.name}`}</li>
              ))}
            </ul>
          </Section>
          <Section title='Activity note'>
            <p className='text-sm text-muted-foreground' data-note-preview>
              {`Documents uploaded via ResSpark by ${agentName}: ${noteFiles.join(', ')}`}
            </p>
            <p className='text-sm text-muted-foreground'>IDs are added automatically.</p>
          </Section>
          {error && (
            <Alert variant='destructive'>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
        <SheetFooter className='flex-row justify-end gap-4'>
          <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type='button' disabled={n === 0 || push.isPending} onClick={confirm}>
            {push.isPending ? 'Pushing…' : `Push ${n} ${n === 1 ? 'file' : 'files'}`}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
