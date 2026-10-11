import { z } from 'zod'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { RequestBuilder } from '@/features/requests/request-builder'

const searchSchema = z.object({ case: z.uuid() })

export const Route = createFileRoute('/admin/_shell/requests/new')({
  validateSearch: searchSchema,
  component: NewRequestRoute,
})

function NewRequestRoute() {
  const { case: caseId } = Route.useSearch()
  const navigate = useNavigate()
  return (
    <>
      <Header>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>
      <Main>
        <RequestBuilder
          caseId={caseId}
          onCreated={(id) =>
            navigate({
              to: '/admin/requests/$requestId',
              params: { requestId: id },
              replace: true,
            })
          }
        />
      </Main>
    </>
  )
}
