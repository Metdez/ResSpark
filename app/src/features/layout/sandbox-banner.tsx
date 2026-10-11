import { useQuery } from '@tanstack/react-query'
import { api, isConfig } from '@/lib/api'

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
      <span>Test environment — nothing here is sent to IRS Logics.</span>
    </div>
  )
}
