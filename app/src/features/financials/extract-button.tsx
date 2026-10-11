import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { extractValues, type ExtractReason } from './api'

// Reason codes are never shown raw (D-20).
const REASON: Record<ExtractReason, string> = {
  no_template: 'No matching template',
  missing_fields: 'Required values not found',
  unreadable: 'Could not read this PDF',
  too_large: 'Too large',
  not_pdf: 'Not a PDF',
}

// FORM-03 / D-17: read the case's uploaded PDFs into Document proposals that staff confirm like any other.
export function ExtractButton({ caseId }: { caseId: string }) {
  const qc = useQueryClient()
  const extract = useMutation({
    mutationFn: () => extractValues(caseId),
    onSuccess: (r) => toast.success(`Read ${r.parsed} of ${r.documents} documents. ${r.proposals.inserted} new values proposed.`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['financials', caseId] }),
  })
  const unread = extract.data ? [...extract.data.failed, ...extract.data.skipped] : []
  return (
    <div className='grid gap-1'>
      <Button type='button' size='sm' variant='outline' disabled={extract.isPending} onClick={() => extract.mutate()}>
        {extract.isPending ? 'Reading documents…' : 'Extract values'}
      </Button>
      {unread.length > 0 && (
        <ul aria-label='Documents not read' className='text-sm text-muted-foreground'>
          {unread.map((f) => (
            <li key={f.document_id}>
              {f.name}: {REASON[f.reason]}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
