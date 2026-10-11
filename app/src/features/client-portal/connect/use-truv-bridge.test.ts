import { afterEach, describe, expect, it } from 'vitest'
import { loadTruvBridge, type TruvBridgeApi } from './use-truv-bridge'

const SRC = 'https://cdn.truv.com/bridge.js'
const scripts = () => [...document.querySelectorAll('script')].filter((s) => s.src === SRC)

afterEach(() => {
  scripts().forEach((s) => s.remove())
  delete window.TruvBridge
})

describe('loadTruvBridge', () => {
  it('injects nothing until called', () => {
    expect(scripts()).toHaveLength(0)
  })

  it('appends exactly one script even when called twice, and resolves on load', async () => {
    const a = loadTruvBridge()
    const b = loadTruvBridge()
    expect(scripts()).toHaveLength(1)
    expect(scripts()[0].async).toBe(true)
    const api: TruvBridgeApi = { init: () => ({ open() {}, close() {} }) }
    window.TruvBridge = api
    scripts()[0].dispatchEvent(new Event('load'))
    await expect(a).resolves.toBe(api)
    await expect(b).resolves.toBe(api)
  })

  it('rejects bridge_load_failed on error and lets a later call retry', async () => {
    const p = loadTruvBridge()
    scripts()[0].dispatchEvent(new Event('error'))
    await expect(p).rejects.toThrow('bridge_load_failed')
    expect(scripts()).toHaveLength(0)
    void loadTruvBridge().catch(() => {})
    expect(scripts()).toHaveLength(1)
    scripts()[0].dispatchEvent(new Event('error'))
  })
})
