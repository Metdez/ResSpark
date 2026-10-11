import { ApiError } from '@/lib/api'
import { GENERIC_ERROR } from '@/lib/handle-server-error'
import { TONE_CLASSES } from '@/lib/status'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { CountyBlock, FinancialsView } from './api'
import { FinancialsHeader } from './financials-header'
import { RecommendationRail } from './recommendation-rail'
import { SectionTable } from './section-table'
import { SourceBadge } from './source-badge'
import { useFinancials, useLatestEvaluation, useRefresh } from './use-financials'

const Title = ({ children }: { children: React.ReactNode }) => (
  <h1 className='mb-6 text-2xl leading-tight font-semibold'>{children}</h1>
)

// D-12 / ADDR-02: the county is shown, never chosen; it comes only from an address.
function countyText(c: CountyBlock): { text: string; warn: boolean } {
  const fips = c.county_fips ? ` (FIPS ${c.county_fips})` : ''
  switch (c.status) {
    case 'confirmed_address':
      return { text: `${c.irs_county ?? 'County'}${fips}`, warn: false }
    case 'from_other_address':
      return { text: `${c.irs_county ?? 'County'} — from an address the client has not confirmed. Ask the client to confirm their address.`, warn: true }
    case 'ct_old_county':
      return {
        text: `The address uses the old Connecticut county code${fips}. IRS standards use planning regions, so ask the client to re-confirm their address.`,
        warn: true,
      }
    case 'not_in_irs_table':
      return { text: `${c.smarty_county ?? 'This county'}${fips} is not in the IRS housing table. Check the client's address.`, warn: true }
    default:
      return { text: "Needs data — waiting for the client's address", warn: true }
  }
}

function CountyRow({ county }: { county: CountyBlock }) {
  const { text, warn } = countyText(county)
  return (
    <div data-county={county.status} className='flex flex-wrap items-center gap-2 px-4 pb-3 text-sm'>
      <span className='font-medium'>County</span>
      <span className={cn('rounded-md border px-2 py-0.5', warn ? TONE_CLASSES.warning : 'border-transparent')}>{text}</span>
      {county.status !== 'waiting_for_address' && <SourceBadge source='address' />}
    </div>
  )
}

function Employers({ caseId, view }: { caseId: string; view: FinancialsView }) {
  const refresh = useRefresh(caseId)
  const spouse = view.settings.spouse_employer_ids
  const assign = (id: string, toSpouse: boolean) =>
    refresh.mutate({ spouse_employer_ids: toSpouse ? [...spouse, id] : spouse.filter((x) => x !== id) })

  if (view.employers.length === 0) return <p className='px-4 pb-3 text-sm text-muted-foreground'>No payroll connection yet.</p>
  return (
    <ul className='grid gap-2 px-4 pb-3'>
      {view.employers.map((e) => (
        <li key={e.employer_id} data-employer={e.employer_id} className='flex flex-wrap items-center gap-3 text-sm'>
          <span className='font-medium'>{e.company_name ?? 'Unnamed employer'}</span>
          <SourceBadge source='truv' />
          <div role='group' aria-label={`Whose employer is ${e.company_name ?? 'this'}`} className='inline-flex gap-1 rounded-md border p-0.5'>
            {(['taxpayer', 'spouse'] as const).map((p) => (
              <Button
                key={p}
                type='button'
                size='sm'
                variant={e.person === p ? 'secondary' : 'ghost'}
                aria-pressed={e.person === p}
                disabled={refresh.isPending}
                onClick={() => e.person !== p && assign(e.employer_id, p === 'spouse')}
              >
                {p === 'spouse' ? 'Spouse' : 'Taxpayer'}
              </Button>
            ))}
          </div>
        </li>
      ))}
    </ul>
  )
}

// D-14 layout: statement sections on the left, the recommendation rail on the right.
export function FinancialsPage({ caseId }: { caseId: string }) {
  const financials = useFinancials(caseId)
  const latest = useLatestEvaluation(caseId)

  if (financials.isPending)
    return (
      <>
        <Title>433-A worksheet</Title>
        <div className='grid gap-4'>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className='h-10 w-full' />
          ))}
        </div>
      </>
    )

  if (financials.isError)
    return (
      <>
        <Title>433-A worksheet</Title>
        <Alert variant='destructive'>
          <AlertTitle className='whitespace-normal'>Couldn't load the 433-A worksheet</AlertTitle>
          <AlertDescription>
            {GENERIC_ERROR}
            {financials.error instanceof ApiError && <span className='text-muted-foreground'>{financials.error.code}</span>}
          </AlertDescription>
        </Alert>
      </>
    )

  const view = financials.data
  const run = latest.data?.run ?? null
  const name = [view.case.first_name, view.case.last_name].filter(Boolean).join(' ')
  return (
    <>
      <Title>{name ? `433-A worksheet for ${name}` : '433-A worksheet'}</Title>
      <FinancialsHeader caseId={caseId} view={view} />
      <div className='grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start'>
        <div className='grid gap-4'>
          {view.sections.map((section) => (
            <SectionTable key={section.id} caseId={caseId} view={view} section={section} run={run}>
              {section.id === 'household' && <CountyRow county={view.county} />}
              {section.id === 'employment' && <Employers caseId={caseId} view={view} />}
            </SectionTable>
          ))}
        </div>
        <aside aria-label='Recommendation'>
          <RecommendationRail caseId={caseId} />
        </aside>
      </div>
    </>
  )
}
