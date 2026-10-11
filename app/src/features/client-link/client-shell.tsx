import { useEffect, type ReactNode } from 'react'
import { Card } from '@/components/ui/card'

interface ClientShellProps {
  firmName: string
  agentName?: string
  children: ReactNode
}

// S5 client layout: one 480 px column, no admin chrome, nothing below 16 px.
export function ClientShell({
  firmName,
  agentName,
  children,
}: ClientShellProps) {
  useEffect(() => {
    document.title = firmName
    const existing = document.head.querySelector('meta[name="robots"]')
    if (existing) return
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.append(meta)
    return () => meta.remove()
  }, [firmName])

  return (
    <div className='min-h-svh bg-muted/40'>
      <main id='main' className='mx-auto w-full max-w-[30rem] px-4 pt-16 pb-8'>
        <header className='mb-6'>
          <h1
            className='truncate text-xl leading-tight font-semibold'
            title={firmName}
          >
            {firmName}
          </h1>
          {agentName && (
            <p className='line-clamp-2 text-base text-muted-foreground'>
              Your agent: {agentName}
            </p>
          )}
        </header>
        <Card className='rounded-lg p-6'>{children}</Card>
      </main>
    </div>
  )
}
