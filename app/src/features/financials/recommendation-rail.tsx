import { Link } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { EvaluationResponse, RunView } from './api'
import { formatDay, formatMoney } from './format'
import { useExportWorksheet, useLatestEvaluation, useRunEvaluation } from './use-financials'

// D-15 wording, shown in every state of the rail.
const REVIEW_NOTE = 'A tax professional must review this result before anything is filed.'

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={strong ? 'flex justify-between gap-4 border-t pt-2 font-semibold' : 'flex justify-between gap-4'}>
      <dt>{label}</dt>
      <dd className='text-right tabular-nums'>{formatMoney(value)}</dd>
    </div>
  )
}

function Blocked({ outcome }: { outcome: Exclude<EvaluationResponse['outcome'], { kind: 'determination' }> }) {
  if (outcome.kind === 'standards_unavailable')
    return (
      <>
        <CardTitle>Standards unavailable</CardTitle>
        <p className='text-sm'>No IRS standards were found for this county and household. Check both, then run the evaluation again.</p>
      </>
    )
  return (
    <>
      <CardTitle>Information still needed</CardTitle>
      <ul className='list-disc ps-5 text-sm'>
        {outcome.missing.map((m) => (
          <li key={m.column}>{m.label}</li>
        ))}
      </ul>
      {outcome.review_flags.length > 0 && <Flags flags={outcome.review_flags} />}
    </>
  )
}

const Flags = ({ flags }: { flags: string[] }) => (
  <ul aria-label='Review flags' className='list-disc ps-5 text-sm text-amber-800 dark:text-amber-300'>
    {flags.map((f) => (
      <li key={f}>{f}</li>
    ))}
  </ul>
)

// D-14 / D-15: every number below is the engine's, read from the run; the rail computes nothing.
function RunDetails({ run }: { run: RunView }) {
  const s = run.standards_inputs
  return (
    <>
      <Card>
        <CardContent>
          <dl className='grid gap-2 text-sm'>
            <Row label='Box D — monthly income' value={run.monthly_income} />
            <Row label='Box E — allowable expenses' value={run.monthly_expenses} />
            <Row label='Box F — net disposable income' value={run.net_disposable_income} strong />
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Net realizable equity</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className='grid gap-2 text-sm'>
            {run.nre_lines.map((l) => (
              <Row key={l.key} label={l.label} value={l.value} />
            ))}
            <Row label='Total net realizable equity' value={run.net_realizable_equity} strong />
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardContent className='grid gap-1 text-sm'>
          <div className='flex justify-between gap-4 font-semibold'>
            <span>Suggested amount</span>
            <span className='tabular-nums'>{formatMoney(run.suggested_offer_or_payment)}</span>
          </div>
          {run.payment_math && (
            <p className='text-muted-foreground tabular-nums'>
              {formatMoney(run.payment_math.total_tax_owed)} ÷ {run.payment_math.csed_months_used} months, rounded up to the cent
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className='grid gap-1 text-sm text-muted-foreground'>
          <p>
            County: {String(s.county)}, {String(s.state)}
          </p>
          <p>Household: {String(s.household_size)}</p>
          {run.standards_effective_date && <p>IRS standards effective {formatDay(run.standards_effective_date)}</p>}
          <p title={run.created_at}>
            Run {formatDay(run.created_at)}
            {run.created_by_name && ` by ${run.created_by_name}`}
          </p>
        </CardContent>
      </Card>
    </>
  )
}

export function RecommendationRail({ caseId }: { caseId: string }) {
  const latest = useLatestEvaluation(caseId)
  const evaluate = useRunEvaluation(caseId)
  const exporter = useExportWorksheet(caseId)
  const outcome = evaluate.data?.outcome
  // The last run attempt wins: missing facts or unavailable standards hide every amount.
  const blocked = outcome && outcome.kind !== 'determination' ? outcome : null
  const run = blocked ? null : (evaluate.data?.run ?? latest.data?.run ?? null)
  const saved = run && exporter.data && exporter.variables === run.id ? exporter.data : null

  return (
    <div data-rail className='grid gap-4 lg:sticky lg:top-20'>
      <Card>
        <CardHeader className='grid gap-2'>
          {blocked ? (
            <Blocked outcome={blocked} />
          ) : run ? (
            <>
              <CardTitle>{run.outcome?.label ?? run.path}</CardTitle>
              <p className='text-sm font-medium'>{run.path}</p>
              <p className='text-sm'>{run.reason}</p>
              {run.review_flags.length > 0 && <Flags flags={run.review_flags} />}
            </>
          ) : (
            <>
              <CardTitle>No evaluation yet</CardTitle>
              <p className='text-sm text-muted-foreground'>Confirm the required facts, then run the evaluation.</p>
            </>
          )}
          <p className='text-sm text-muted-foreground'>{run?.next ?? REVIEW_NOTE}</p>
        </CardHeader>
        <CardContent className='grid gap-2'>
          <Button type='button' disabled={evaluate.isPending} onClick={() => evaluate.mutate()}>
            {evaluate.isPending && <Loader2 aria-hidden='true' className='size-4 animate-spin' />}
            {evaluate.isPending ? 'Running…' : 'Run evaluation'}
          </Button>
          <Button type='button' variant='outline' disabled={!run || exporter.isPending} onClick={() => run && exporter.mutate(run.id)}>
            {exporter.isPending && <Loader2 aria-hidden='true' className='size-4 animate-spin' />}
            {exporter.isPending ? 'Exporting…' : 'Export worksheet PDF'}
          </Button>
          {saved && (
            <p role='status' className='text-sm'>
              Worksheet saved.{' '}
              {saved.request_id ? (
                <Link to='/admin/requests/$requestId' params={{ requestId: saved.request_id }} className='font-medium text-primary underline-offset-4 hover:underline'>
                  Push it from the request page
                </Link>
              ) : (
                'Create a request for this case to push it.'
              )}
            </p>
          )}
        </CardContent>
      </Card>
      {run && <RunDetails run={run} />}
    </div>
  )
}
