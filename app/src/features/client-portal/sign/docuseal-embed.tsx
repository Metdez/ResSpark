import { lazy, Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

// D-14: the only @docuseal/react import, lazy so the wrapper stays out of the client entry chunk.
const DocusealForm = lazy(() => import('@docuseal/react').then((m) => ({ default: m.DocusealForm })))

// RESEARCH Pitfall 3: our 16 px rule cannot reach the embed's shadow root.
const CUSTOM_CSS = 'input,textarea,select{font-size:16px!important}'

export function DocusealEmbed({ src, onComplete }: { src: string; onComplete(): void }) {
  return (
    <Suspense
      fallback={
        <div className='grid gap-3 p-4' aria-busy='true'>
          <Skeleton className='h-4 w-3/4' />
          <Skeleton className='h-4 w-full' />
          <Skeleton className='h-4 w-2/3' />
        </div>
      }
    >
      <DocusealForm
        src={src}
        withTitle={false}
        onlyRequiredFields
        withSendCopyButton={false}
        sendCopyEmail={false}
        allowToResubmit={false}
        language='en'
        expand
        goToLast
        customCss={CUSTOM_CSS}
        onComplete={onComplete}
      />
    </Suspense>
  )
}
