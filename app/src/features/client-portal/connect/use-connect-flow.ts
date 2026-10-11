import { useState } from 'react'
import { toast } from 'sonner'
import { PortalError } from '../portal-api'
import { connectErrorCopy } from './connect-copy'
import { recordConsent, startConnection } from './connection-api'

type Started = Awaited<ReturnType<typeof startConnection>>

// The server no longer holds a consent for the current wording: ask again inside the consent sheet.
const STALE = new Set(['consent_text_stale', 'consent_required'])

const codeOf = (e: unknown) => (e instanceof PortalError ? e.code : e instanceof Error ? e.message : '')

// Shared by the payroll and bank sheets: (consent once) → start → hand the result to `open`.
export function useConnectFlow({
  kind,
  itemId,
  consented,
  open,
  onConsentStale,
  errorCopy = (code) => connectErrorCopy(code, kind),
}: {
  kind: 'bank' | 'payroll'
  itemId: string
  consented: boolean
  open(started: Started): Promise<void> | void
  onConsentStale?(): void
  errorCopy?(code: string): string
}) {
  const [consenting, setConsenting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notConfigured, setNotConfigured] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  async function run(withConsent: boolean) {
    setBusy(true)
    try {
      if (withConsent) await recordConsent(kind === 'bank' ? 'bank_data' : 'payroll_data')
      setConsenting(false)
      setNotice(null)
      await open(await startConnection(kind, itemId))
    } catch (e) {
      const code = codeOf(e)
      if (STALE.has(code)) {
        // one error surface: the notice inside the reopened consent sheet, no toast
        setNotice(connectErrorCopy('consent_text_stale', kind))
        setConsenting(true)
        onConsentStale?.()
        return
      }
      setConsenting(false)
      if (code === 'provider_not_configured') setNotConfigured(true)
      toast.error(errorCopy(code))
    } finally {
      setBusy(false)
    }
  }

  return {
    busy,
    consenting,
    notConfigured,
    notice,
    connect: () => (consented ? void run(false) : setConsenting(true)),
    agree: () => void run(true),
    cancelConsent: () => {
      setConsenting(false)
      setNotice(null)
    },
  }
}
