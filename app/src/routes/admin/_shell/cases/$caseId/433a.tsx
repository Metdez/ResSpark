import { createFileRoute } from '@tanstack/react-router'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { FinancialsPage } from '@/features/financials/financials-page'

export const Route = createFileRoute('/admin/_shell/cases/$caseId/433a')({
  component: FinancialsRoute,
})

function FinancialsRoute() {
  const { caseId } = Route.useParams()
  return (
    <>
      <Header>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>
      <Main>
        <FinancialsPage caseId={caseId} />
      </Main>
    </>
  )
}
