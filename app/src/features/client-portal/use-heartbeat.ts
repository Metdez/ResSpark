import { useEffect } from 'react'
import { heartbeat, type HeartbeatBody } from './portal-api'

const uaClass = (): HeartbeatBody['user_agent_class'] =>
  matchMedia('(max-width: 767px)').matches
    ? 'phone'
    : matchMedia('(max-width: 1023px)').matches
      ? 'tablet'
      : 'desktop'

// D-12: tells the Worker where the client is, at once and every 30 s while the tab is visible.
export function useHeartbeat({
  enabled,
  lastStep,
  lastError,
}: {
  enabled: boolean
  lastStep: string
  lastError?: HeartbeatBody['last_error']
}): void {
  useEffect(() => {
    if (!enabled) return
    let skipNext = false
    const send = async () => {
      if (document.visibilityState !== 'visible') return
      if (skipNext) {
        skipNext = false
        return
      }
      const result = await heartbeat({
        last_step: lastStep,
        last_error: lastError,
        user_agent_class: uaClass(),
      })
      skipNext = result === 'rate_limited'
    }
    void send()
    const id = setInterval(() => void send(), 30_000)
    return () => clearInterval(id)
  }, [enabled, lastStep, lastError])
}
