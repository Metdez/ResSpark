export interface TruvBridgeApi {
  init(opts: {
    isOrder: true
    bridgeToken: string
    onEvent?(type: string, payload: unknown, source: string): void
    onClose?(): void
    onLoad?(): void
  }): { open(): void; close(): void }
}

declare global {
  interface Window {
    TruvBridge?: TruvBridgeApi
  }
}

const SRC = 'https://cdn.truv.com/bridge.js'
let loading: Promise<TruvBridgeApi> | null = null

// D-05: the vendor script loads only when the client taps Connect, never with the portal bundle.
export function loadTruvBridge(): Promise<TruvBridgeApi> {
  if (window.TruvBridge) return Promise.resolve(window.TruvBridge)
  loading ??= new Promise<TruvBridgeApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SRC
    script.async = true
    script.addEventListener('load', () =>
      window.TruvBridge ? resolve(window.TruvBridge) : reject(new Error('bridge_load_failed'))
    )
    script.addEventListener('error', () => reject(new Error('bridge_load_failed')))
    document.head.append(script)
  })
    .catch((e: unknown) => {
      // a failed load may be retried with a fresh script tag
      document.querySelectorAll(`script[src="${SRC}"]`).forEach((s) => s.remove())
      throw e
    })
    .finally(() => {
      loading = null
    })
  return loading
}
