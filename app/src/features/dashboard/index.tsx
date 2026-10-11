import { Inbox } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'

export function Dashboard() {
  return (
    <>
      <Header>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main>
        <h1 className='mb-6 text-2xl font-semibold leading-tight'>Dashboard</h1>
        <Card>
          <CardContent className='flex min-h-60 flex-col items-center justify-center gap-2 py-12 text-center'>
            <Inbox className='size-12 text-muted-foreground' aria-hidden='true' />
            <h2 className='text-xl font-semibold leading-tight'>
              Nothing to do yet
            </h2>
            <p className='max-w-md text-muted-foreground'>
              Requests you send to clients will show up here with their status,
              who they're waiting on, and how long they've been open.
            </p>
          </CardContent>
        </Card>
      </Main>
    </>
  )
}
