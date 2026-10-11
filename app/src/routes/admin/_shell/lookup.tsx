import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { LookupPage } from '@/features/lookup/lookup-page'

export const Route = createFileRoute('/admin/_shell/lookup')({
  component: LookupRoute,
})

function LookupRoute() {
  const navigate = useNavigate()
  return (
    <>
      <Header>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>
      <Main>
        <LookupPage
          onConfirmed={(caseId) =>
            navigate({ to: '/admin/requests/new', search: { case: caseId } })
          }
        />
      </Main>
    </>
  )
}
