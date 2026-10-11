import { ApiError } from '@/lib/api'
import { GENERIC_ERROR } from '@/lib/handle-server-error'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { SectionTable } from './section-table'
import { useFinancials } from './use-financials'

const Title = ({ children }: { children: React.ReactNode }) => (
  <h1 className='mb-6 text-2xl leading-tight font-semibold'>{children}</h1>
)

// D-14 layout: statement sections on the left, the recommendation rail on the right.
export function FinancialsPage({ caseId }: { caseId: string }) {
  const financials = useFinancials(caseId)

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
  const name = [view.case.first_name, view.case.last_name].filter(Boolean).join(' ')
  return (
    <>
      <Title>{name ? `433-A worksheet for ${name}` : '433-A worksheet'}</Title>
      <div className='grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start'>
        <div className='grid gap-4'>
          {view.sections.map((section) => (
            <SectionTable key={section.id} caseId={caseId} view={view} section={section} />
          ))}
        </div>
        <aside aria-label='Recommendation' />
      </div>
    </>
  )
}
