import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import type { Tone } from '@/lib/status'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/status-badge'
import { UploadSheet } from '@/features/uploads/upload-sheet'
import type { PortalStep } from '../portal-api'
import { CONNECT_COPY, connectErrorCopy } from './connect-copy'
import { reconcileConnection, type ClientConnectionView } from './connection-api'
import { ConsentSheet } from './consent-sheet'
import { useConnectFlow } from './use-connect-flow'
import { useItemConnection } from './use-item-connection'
import { loadTruvBridge } from './use-truv-bridge'

const T = CONNECT_COPY.payroll
type Employer = ClientConnectionView['employers'][number]

const BADGE: Record<Employer['status'], { tone: Tone; label: string }> = {
  pending: { tone: 'neutral', label: 'Waiting' },
  connected: { tone: 'info', label: 'Connecting' },
  done: { tone: 'success', label: 'Done' },
  error: { tone: 'destructive', label: 'Needs attention' },
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`
const counts = (e: Employer) =>
  [e.pay_stubs ? plural(e.pay_stubs, 'pay stub') : '', e.w2s ? plural(e.w2s, 'W-2') : ''].filter(Boolean).join(' · ')

// D-05/D-07: consent → start → Truv Bridge in the portal; COMPLETED (order) or close → reconcile.
export function PayrollStep({
  step,
  firmName,
  open,
  onClose,
}: {
  step: PortalStep
  firmName: string
  open: boolean
  onClose(): void
}) {
  const qc = useQueryClient()
  const { data, isError, refetch } = useItemConnection(step.id, open)
  const [uploading, setUploading] = useState(false)
  // the Radix sheet blocks pointer events on the page, so it steps aside while Bridge is open
  const [bridgeOpen, setBridgeOpen] = useState(false)

  const flow = useConnectFlow({
    kind: 'payroll',
    itemId: step.id,
    consented: data?.consented ?? false,
    errorCopy: (code) => (code === 'bridge_load_failed' ? T.bridgeFailed : connectErrorCopy(code, 'payroll')),
    open: async ({ connection_id, bridge_token }) => {
      if (!bridge_token) throw new Error('provider_error')
      const bridge = await loadTruvBridge()
      const sync = () => void reconcileConnection(connection_id).then(() => refetch())
      setBridgeOpen(true)
      bridge
        .init({
          isOrder: true,
          bridgeToken: bridge_token,
          // D-05: only the order-level COMPLETED means documents are coming; bridge SUCCESS does not
          onEvent: (type, _payload, source) => {
            if (source === 'order' && type === 'COMPLETED') sync()
          },
          onClose: () => {
            setBridgeOpen(false)
            sync()
          },
        })
        .open()
    },
  })

  if (uploading)
    return (
      <UploadSheet
        item={{ id: step.id, label: step.label, status: step.status }}
        open
        onClose={() => {
          setUploading(false)
          void qc.invalidateQueries({ queryKey: ['portal', 'state'] })
        }}
      />
    )

  if (flow.consenting)
    return (
      <ConsentSheet
        kind='payroll_data'
        firmName={firmName}
        open
        busy={flow.busy}
        onAgree={flow.agree}
        onClose={flow.cancelConsent}
      />
    )

  const conn = data?.connection ?? null
  const notConfigured = flow.notConfigured || data?.provider.configured === false
  const status = conn?.status
  const fresh = !conn || status === 'error' || status === 'removed'

  const connectButton = (label: string) => (
    <Button size='xl' className='w-full' disabled={flow.busy} onClick={flow.connect}>
      {flow.busy ? <Loader2 className='animate-spin motion-reduce:animate-none' aria-hidden='true' /> : null}
      {label}
    </Button>
  )

  const message = isError
    ? connectErrorCopy('', 'payroll')
    : notConfigured
      ? T.notConfigured
      : status === 'error'
        ? connectErrorCopy(conn?.error_code ?? '', 'payroll')
        : fresh
          ? T.intro
          : status === 'done'
            ? T.done
            : status === 'pending'
              ? T.finishing
              : T.connected

  return (
    <Sheet open={open && !bridgeOpen} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side='bottom'
        className='mx-auto max-h-dvh max-w-[30rem] overflow-y-auto rounded-t-lg [&>button:last-child]:hidden'
      >
        <SheetHeader className='p-6 pb-0'>
          <SheetTitle className='text-xl leading-tight'>{step.label}</SheetTitle>
          <SheetDescription className='sr-only'>{T.intro}</SheetDescription>
        </SheetHeader>
        <div className='grid gap-4 px-6 pb-6'>
          {!data && !isError ? (
            <div className='flex flex-col gap-3' aria-busy='true'>
              <Skeleton className='h-4 w-3/4' />
              <Skeleton className='h-4 w-full' />
              <Skeleton className='h-4 w-2/3' />
            </div>
          ) : (
            <>
              <p className='text-base' data-connect-message>
                {message}
              </p>
              {!notConfigured && !isError && conn && conn.employers.length > 0 && (
                <ul className='grid'>
                  {conn.employers.map((e, i) => (
                    <li key={i} data-employer className='flex min-h-11 flex-wrap items-center gap-3 border-b py-3 last:border-0'>
                      <div className='min-w-0 flex-1'>
                        <p className='text-base font-medium break-words'>{e.company_name ?? 'Employer'}</p>
                        {counts(e) && <p className='text-base text-muted-foreground'>{counts(e)}</p>}
                      </div>
                      <StatusBadge tone={BADGE[e.status].tone} label={BADGE[e.status].label} size='lg' />
                    </li>
                  ))}
                </ul>
              )}
              {!notConfigured && !isError && fresh && connectButton(status === 'error' ? 'Try again' : T.connect)}
              {!notConfigured && !isError && (status === 'pending' || status === 'connected' || status === 'syncing') &&
                connectButton(T.another)}
            </>
          )}
          <Button size='xl' variant='outline' className='w-full' onClick={() => setUploading(true)}>
            {T.upload}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
