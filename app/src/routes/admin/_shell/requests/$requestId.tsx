import { createFileRoute } from '@tanstack/react-router'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { RequestPage } from '@/features/requests/request-page'

export const Route = createFileRoute('/admin/_shell/requests/$requestId')({
  component: RequestRoute,
})

function RequestRoute() {
  const { requestId } = Route.useParams()
  return (
    <>
      <Header>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>
      <Main>
        <RequestPage requestId={requestId} />
      </Main>
    </>
  )
}
