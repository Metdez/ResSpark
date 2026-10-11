import { createFileRoute } from '@tanstack/react-router'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { RequestsListPage } from '@/features/requests/requests-list-page'

export const Route = createFileRoute('/admin/_shell/requests/')({
  component: RequestsRoute,
})

function RequestsRoute() {
  return (
    <>
      <Header>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>
      <Main>
        <RequestsListPage />
      </Main>
    </>
  )
}
