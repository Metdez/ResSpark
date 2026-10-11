import { useSearch } from '@tanstack/react-router'
import { Card } from '@/components/ui/card'
import { UserAuthForm } from './components/user-auth-form'

const appName = import.meta.env.VITE_APP_NAME ?? 'ResSpark'

// UI-SPEC S1. The SANDBOX banner (36 px) renders above this from admin/route.tsx.
export function SignIn() {
  const { redirect } = useSearch({ from: '/admin/sign-in' })

  return (
    <main className='flex min-h-[calc(100svh-2.25rem)] items-center justify-center bg-muted/40 p-4'>
      <Card className='w-96 max-w-full gap-4 rounded-lg border p-6 shadow-sm'>
        <p className='text-xl leading-tight font-semibold text-brand'>{appName}</p>
        <div className='grid gap-1'>
          <h1 className='text-2xl leading-tight font-semibold'>
            Sign in to {appName}
          </h1>
          {/* firm name falls back to the product name until Phase 2 */}
          <p className='text-sm text-muted-foreground'>
            Staff access for {appName}. Accounts are created by your admin.
          </p>
        </div>
        <UserAuthForm redirectTo={redirect} />
      </Card>
    </main>
  )
}
