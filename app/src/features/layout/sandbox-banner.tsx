import { useQuery } from '@tanstack/react-query'
import { api, isConfig } from '@/lib/api'

// Phase 5 D-10: the banner says whether a Logics push is simulated. Phase 1's sentence stays the
// fail-safe text while /api/config is loading or failed.
const MODE_TEXT = {
  fake: 'Logics writes simulated',
  live: 'Test environment — Logics writes go to allowlisted test cases only',
}

// Fail-safe: shown while pending and on error; hidden only on proof of production
export function SandboxBanner() {
  const { data } = useQuery({
    queryKey: ['config'],
    queryFn: () => api('/api/config', {}, isConfig),
    retry: 1,
    staleTime: 60_000,
  })
  if (data?.app_env === 'production') return null
  return (
    <div
      role='status'
      data-slot='sandbox-banner'
      className='sticky top-0 z-50 flex min-h-9 w-full items-center justify-center gap-2 bg-warning px-3 text-center text-sm text-warning-foreground'
    >
      <span className='font-semibold'>SANDBOX</span>
      {data && <span aria-hidden='true'>·</span>}
      <span>{data ? MODE_TEXT[data.logics_mode] : 'Test environment — nothing here is sent to IRS Logics.'}</span>
    </div>
  )
}
