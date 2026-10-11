import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { Filters } from './filters'
import { RequestTable } from './request-table'

export function Dashboard() {
  return (
    <>
      <Header>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main>
        <h1 className='mb-6 text-2xl leading-tight font-semibold'>Requests</h1>
        <Filters />
        <RequestTable />
      </Main>
    </>
  )
}
