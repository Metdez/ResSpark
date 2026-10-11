import { Inbox } from 'lucide-react'
import { ClientShell } from './client-shell'

const firmName = import.meta.env.VITE_APP_NAME ?? 'ResSpark'

export function NoLinkPage() {
  return (
    <ClientShell firmName={firmName}>
      <div className='flex flex-col items-center gap-2 text-center'>
        <Inbox className='size-12 text-muted-foreground' aria-hidden='true' />
        <h2 className='text-xl leading-tight font-semibold'>
          Nothing to do yet
        </h2>
        <p className='text-base text-muted-foreground'>
          Your agent will send you a link when there's something for you to
          complete. You can close this page.
        </p>
      </div>
    </ClientShell>
  )
}
