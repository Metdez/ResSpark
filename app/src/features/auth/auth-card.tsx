import { Card } from '@/components/ui/card'

const appName = import.meta.env.VITE_APP_NAME ?? 'ResSpark'

// UI-SPEC S1 frame shared by sign-in, sign-up, join and the password pages. The SANDBOX banner
// (36 px) renders above this from admin/route.tsx.
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <main className='flex min-h-[calc(100svh-2.25rem)] items-center justify-center bg-muted/40 p-4'>
      <Card className='w-96 max-w-full gap-4 rounded-lg border p-6 shadow-sm'>
        <p className='text-xl leading-tight font-semibold text-brand'>{appName}</p>
        <div className='grid gap-1'>
          <h1 className='text-2xl leading-tight font-semibold'>{title}</h1>
          {description && <p className='text-sm text-muted-foreground'>{description}</p>}
        </div>
        {children}
        {footer && <div className='text-center text-sm text-muted-foreground'>{footer}</div>}
      </Card>
    </main>
  )
}
