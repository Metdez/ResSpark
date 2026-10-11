import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { listItemDocuments } from '@/features/uploads/api'
import { UploadSheet } from '@/features/uploads/upload-sheet'
import { PortalError, type PortalStep } from '../portal-api'
import { CONNECT_COPY, connectErrorCopy } from './connect-copy'
import { attributeStatement } from './connection-api'
import { ConsentSheet } from './consent-sheet'
import { StatementCells, type MonthCell } from './statement-cells'
import { useConnectFlow } from './use-connect-flow'
import { useItemConnection } from './use-item-connection'

const T = CONNECT_COPY.bank

interface PendingMonth {
  connectionId: string
  accountId: string
  year: number
  month: number
  openedAt: number
}

// D-08/D-10/D-11: consent → hosted link in the same tab; every decision reads capabilities, never the provider.
export function BankStep({
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
  const [uploading, setUploading] = useState<{ month: PendingMonth | null } | null>(null)
  const [redirecting, setRedirecting] = useState(false)

  const flow = useConnectFlow({
    kind: 'bank',
    itemId: step.id,
    consented: data?.consented ?? false,
    open: ({ hosted_link_url }) => {
      if (!hosted_link_url) throw new Error('provider_error')
      setRedirecting(true)
      window.location.assign(hosted_link_url)
    },
  })

  // shortcut: compares the server's uploaded_at with the phone clock; a clock far off could miss
  // or over-attribute a month. Upgrade: snapshot the document ids when the sheet opens.
  async function attribute(m: PendingMonth) {
    const { documents } = await listItemDocuments(step.id)
    for (const d of documents) {
      if (d.status !== 'ready' || Date.parse(d.uploaded_at) <= m.openedAt) continue
      await attributeStatement(m.connectionId, {
        document_id: d.id,
        bank_account_id: m.accountId,
        year: m.year,
        month: m.month,
      }).catch((e: unknown) => {
        // the bank delivered that month meanwhile; the upload stays as a plain document
        if (!(e instanceof PortalError && e.code === 'month_available')) throw e
      })
    }
  }

  if (uploading)
    return (
      <UploadSheet
        item={{ id: step.id, label: step.label, status: step.status }}
        open
        onClose={() => {
          const month = uploading.month
          setUploading(null)
          void qc.invalidateQueries({ queryKey: ['portal', 'state'] })
          if (month)
            void attribute(month)
              .catch(() => {})
              .then(() => refetch())
        }}
      />
    )

  if (flow.consenting)
    return (
      <ConsentSheet
        kind='bank_data'
        firmName={firmName}
        open
        busy={flow.busy}
        onAgree={flow.agree}
        onClose={flow.cancelConsent}
      />
    )

  const conn = data?.connection ?? null
  const caps = data?.provider.capabilities ?? null
  const notConfigured = flow.notConfigured || data?.provider.configured === false
  const unavailable = !notConfigured && caps?.hostedLink !== true
  const status = conn?.status
  const fresh = !conn || status === 'removed'
  const canConnect = !isError && !notConfigured && !unavailable && (fresh || status === 'error')

  const message = isError
    ? connectErrorCopy('', 'bank')
    : notConfigured
      ? T.notConfigured
      : unavailable
        ? T.notAvailable
        : status === 'error'
          ? connectErrorCopy(conn?.error_code ?? '', 'bank')
          : fresh
            ? caps?.statementPdfs
              ? T.intro
              : T.introNoStatements
            : status === 'pending'
              ? T.checking
              : status === 'done'
                ? T.done
                : T.syncing

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
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
              {canConnect && (
                <Button size='xl' className='w-full' disabled={flow.busy || redirecting} onClick={flow.connect}>
                  {flow.busy || redirecting ? (
                    <>
                      <Loader2 className='animate-spin motion-reduce:animate-none' aria-hidden='true' />
                      {T.opening}
                    </>
                  ) : (
                    T.connect
                  )}
                </Button>
              )}
              {conn &&
                !notConfigured &&
                conn.accounts.map((a) => (
                  <section key={a.id} data-account className='grid gap-1'>
                    <h3 className='text-base font-semibold'>
                      {a.name ?? T.accountFallback}
                      {a.mask ? ` ••${a.mask}` : ''}
                    </h3>
                    <StatementCells
                      account={a}
                      onUploadMonth={(cell: MonthCell) =>
                        setUploading({
                          month: {
                            connectionId: conn.id,
                            accountId: a.id,
                            year: cell.year,
                            month: cell.month,
                            openedAt: Date.now(),
                          },
                        })
                      }
                    />
                  </section>
                ))}
            </>
          )}
          <Button size='xl' variant='outline' className='w-full' onClick={() => setUploading({ month: null })}>
            {T.upload}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
