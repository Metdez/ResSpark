import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { maskPhone, normalizePhone } from '@/lib/contact'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/status-badge'
import { formatDate, unlessHandled } from '@/features/requests/requests-api'
import {
  confirmCase,
  logicsErrorCopy,
  type LogicsCaseSummary,
  type LookupType,
  type MatchedField,
} from './lookup-api'

const MATCHED: Record<MatchedField, string> = {
  cell: 'cell phone',
  home: 'home phone',
  work: 'work phone',
  email: 'email',
  case_id: 'case ID',
  last_name_phone: 'last name and phone',
}

const confirmErrorCopy = (code: string) =>
  logicsErrorCopy(code) ??
  (code === 'case_not_found'
    ? {
        title: 'Case not found',
        body: 'Search again, or ask the client for another contact.',
      }
    : undefined)

// C8 / T-02-25: nothing is preselected or auto-confirmed, even for a single result. The tap posts
// /confirm, where the Worker re-reads the case by id. While one
// confirm is in flight every button is disabled so two confirms cannot race.
export function ConfirmCards({
  results,
  searchType,
  onConfirmed,
}: {
  results: LogicsCaseSummary[]
  searchType: LookupType
  onConfirmed: (caseId: string) => void
}) {
  const qc = useQueryClient()
  const confirm = useMutation({
    mutationFn: (logicsCaseId: number) => confirmCase(logicsCaseId, searchType),
    onSuccess: (data) => onConfirmed(data.case_id),
    onError: unlessHandled(qc, (e) => !!confirmErrorCopy(e.code)),
  })
  const error =
    confirm.error instanceof ApiError
      ? confirmErrorCopy(confirm.error.code)
      : undefined

  return (
    <div className='grid gap-4'>
      {error && (
        <Alert variant='destructive'>
          <AlertTitle className='whitespace-normal'>{error.title}</AlertTitle>
          <AlertDescription>{error.body}</AlertDescription>
        </Alert>
      )}
      {results.map((r) => (
        <CaseCard
          key={r.logics_case_id}
          summary={r}
          confirming={confirm.isPending && confirm.variables === r.logics_case_id}
          disabled={confirm.isPending}
          onConfirm={() => confirm.mutate(r.logics_case_id)}
        />
      ))}
    </div>
  )
}

function CaseCard({
  summary: s,
  confirming,
  disabled,
  onConfirm,
}: {
  summary: LogicsCaseSummary
  confirming: boolean
  disabled: boolean
  onConfirm: () => void
}) {
  const name = [s.first_name, s.last_name].filter(Boolean).join(' ')
  const phone = normalizePhone(s.cell_phone ?? s.home_phone ?? s.work_phone ?? '')
  const place = [s.city, s.state].filter(Boolean).join(', ')

  return (
    <Card data-case-card>
      <CardContent className='grid gap-3'>
        <h2 className='text-xl leading-tight font-semibold'>
          {name || 'Unknown name'}
        </h2>
        <div className='flex flex-wrap items-center gap-x-4 gap-y-2 text-sm'>
          <span>Case {s.logics_case_id}</span>
          <StatusBadge
            tone='neutral'
            label={s.status_id === null ? 'Status unknown' : `Status ${s.status_id}`}
          />
          {s.created_date && (
            <span title={s.created_date}>Created {formatDate(s.created_date)}</span>
          )}
          {place && <span>{place}</span>}
        </div>
        <div className='flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground'>
          <span>{phone ? maskPhone(phone.e164) : 'No phone on file'}</span>
          <span>{s.email ?? 'No email on file'}</span>
        </div>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          {s.matched_field ? (
            <StatusBadge tone='neutral' label={`Matched ${MATCHED[s.matched_field]}`} />
          ) : (
            <span />
          )}
          <Button
            type='button'
            variant='outline'
            className='h-10'
            disabled={disabled}
            onClick={onConfirm}
          >
            {confirming && <Loader2 className='size-4 animate-spin' />}
            {confirming ? 'Confirming…' : 'Yes, this is the client'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
