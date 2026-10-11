import { ClientShell } from './client-shell'

const firmName = import.meta.env.VITE_APP_NAME ?? 'ResSpark'
const BODY =
  'It may have expired or been replaced with a new one. Ask your agent for a new link.'

// Same words as the Worker's 404 page (routes/client-link-pages.ts, PORT-06).
export function InvalidLinkPage() {
  return (
    <ClientShell firmName={firmName}>
      <h2 className='text-xl leading-tight font-semibold'>
        This link isn't active
      </h2>
      <p className='mt-2 text-base text-muted-foreground'>{BODY}</p>
    </ClientShell>
  )
}
