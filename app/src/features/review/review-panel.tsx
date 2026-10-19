import { useState } from 'react'
import { ApiError } from '@/lib/api'
import { GENERIC_ERROR } from '@/lib/handle-server-error'
import { itemStatusBadge, requestStatusBadge } from '@/lib/status'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { AddressCard } from './address-card'
import type { ReviewItem } from './api'
import { DocumentRow } from './document-row'
import { RejectDialog } from './reject-dialog'
import { SignatureCard } from './signature-card'
import { useApprove, useReject, useReview } from './use-review'

const Heading = ({ children }: { children: React.ReactNode }) => (
  <h2 className='text-xl leading-tight font-semibold'>{children}</h2>
)

// UI-SPEC Error: a plain sentence, the code only in 14 px muted text.
function DecisionError({ error, notReady }: { error: Error | null; notReady: string }) {
  if (!(error instanceof ApiError)) return null
  return (
    <p className='text-sm text-destructive' role='alert'>
      {error.code === 'item_not_submitted' ? notReady : GENERIC_ERROR}{' '}
      <span className='text-sm text-muted-foreground'>{error.code}</span>
    </p>
  )
}

// A connection returns accounts, transactions and employers, not files; those show in the connection
// card above this panel, so its empty line points there instead of "No files yet" (Oct 12 call).
const EMPTY_COPY: Record<string, string> = {
  bank_connect: 'No statements yet. Accounts and transactions are in the bank connection above.',
  payroll_connect: 'No pay stubs yet. Employers are in the payroll connection above.',
}
const emptyCopy = (kind: string) => EMPTY_COPY[kind] ?? 'No files yet'

export function ReviewPanel({ requestId, caseId }: { requestId: string; caseId: string }) {
  const review = useReview(requestId)
  const approve = useApprove(requestId, caseId)
  const reject = useReject(requestId, caseId)
  const [rejecting, setRejecting] = useState<ReviewItem | null>(null)

  if (!review.data) {
    return (
      <Card>
        <CardContent className='grid gap-4'>
          <Heading>Review</Heading>
          {review.isError ? (
            <Alert variant='destructive'>
              <AlertTitle className='whitespace-normal'>Couldn't load the uploads</AlertTitle>
              <AlertDescription>
                {GENERIC_ERROR}
                {review.error instanceof ApiError && (
                  <span className='text-sm text-muted-foreground'>{review.error.code}</span>
                )}
                <Button type='button' variant='outline' size='sm' className='mt-2' onClick={() => void review.refetch()}>
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            [0, 1, 2].map((i) => <Skeleton key={i} data-skeleton className='h-10 w-full' />)
          )}
        </CardContent>
      </Card>
    )
  }

  const { request, items } = review.data
  const address = review.data.address ?? null
  const signatures = review.data.signatures ?? []
  return (
    <Card>
      <CardContent className='grid gap-4'>
        <div className='flex flex-wrap items-center gap-3'>
          <Heading>Review</Heading>
          <StatusBadge {...requestStatusBadge(request.status)} />
        </div>
        {items.map((item) => {
          // An address item has no files; it is decidable once the client confirmed one (D-07).
          const hasFiles = item.documents.length > 0 || (item.kind === 'address' && address !== null)
          // A done bank or payroll connection approves its item on its own (migration 0011); staff can still
          // send it back to the client even when no file arrived.
          const connection = item.kind === 'bank_connect' || item.kind === 'payroll_connect'
          const canReject = hasFiles || (connection && item.status === 'approved')
          const approving = approve.isPending && approve.variables === item.id
          return (
            <section key={item.id} data-review-item={item.id} className='grid gap-3 rounded-lg border p-4'>
              <div className='flex flex-wrap items-center justify-between gap-4'>
                <div className='flex flex-wrap items-center gap-2'>
                  <span className='font-medium'>{item.label}</span>
                  <span className='text-sm text-muted-foreground'>{item.required ? 'Required' : 'Optional'}</span>
                  <StatusBadge {...itemStatusBadge(item.status, 'staff')} />
                </div>
                <div className='flex gap-4'>
                  <Button
                    type='button'
                    disabled={!hasFiles || item.status === 'approved' || approving}
                    onClick={() => approve.mutate(item.id)}
                  >
                    {item.status === 'approved' ? 'Approved' : 'Approve'}
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    disabled={!canReject}
                    onClick={() => {
                      reject.reset()
                      setRejecting(item)
                    }}
                  >
                    Reject
                  </Button>
                </div>
              </div>
              {item.rejection_note && (
                <p className='text-sm text-muted-foreground'>Note to client: {item.rejection_note}</p>
              )}
              {approve.variables === item.id && (
                <DecisionError error={approve.error} notReady='Nothing to approve yet.' />
              )}
              {item.kind === 'address' && <AddressCard address={address} />}
              {item.kind === 'signature' && (
                <SignatureCard item={item} signature={signatures.find((s) => s.item_id === item.id)} requestId={requestId} />
              )}
              {item.documents.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className='text-end'>Size</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className='text-end'>
                        <span className='sr-only'>Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {item.documents.map((d) => (
                      <DocumentRow key={d.id} document={d} />
                    ))}
                  </TableBody>
                </Table>
              ) : (
                item.kind !== 'address' && <p className='text-sm text-muted-foreground'>{emptyCopy(item.kind)}</p>
              )}
            </section>
          )
        })}
      </CardContent>
      {rejecting && (
        <RejectDialog
          key={rejecting.id}
          open
          onOpenChange={(open) => !open && setRejecting(null)}
          pending={reject.isPending}
          error={<DecisionError error={reject.error} notReady='Nothing to reject yet.' />}
          onConfirm={(note) =>
            reject.mutate({ itemId: rejecting.id, note }, { onSuccess: () => setRejecting(null) })
          }
        />
      )}
    </Card>
  )
}
