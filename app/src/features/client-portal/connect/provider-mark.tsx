import { ShieldCheck } from 'lucide-react'
import { CONNECT_COPY } from './connect-copy'

type ProviderId = 'plaid' | 'truv' | 'teller'

const NAMES: Record<ProviderId, string> = { plaid: 'Plaid', truv: 'Truv', teller: 'Teller' }

// Oct 12 2026 call: the client wants to recognise the provider on the sheet. Display only —
// behaviour still branches on `provider.capabilities` (D-11), never on this id.
export function ProviderMark({ id }: { id: ProviderId | null | undefined }) {
  const name = id ? NAMES[id] : undefined
  if (!name) return null
  return (
    <p data-provider-mark className='flex items-center gap-1.5 text-base text-muted-foreground'>
      <ShieldCheck className='size-4 shrink-0' aria-hidden='true' />
      {CONNECT_COPY.poweredBy(name)}
    </p>
  )
}
