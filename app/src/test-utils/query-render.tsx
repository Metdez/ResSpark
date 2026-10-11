import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'

// Component-test harness: createRoot + act inside a QueryClientProvider, with `fetch` answered
// from a `'METHOD /path'` table. Callers mock `@/lib/supabase` themselves (vi.mock is hoisted per file).
export type Reply = { status: number; body: unknown } | 'pending'

let root: Root | undefined
let container: HTMLDivElement | undefined

export const tick = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })

// Polls until `check` passes (queries settle after the lazy supabase import on first use).
export async function waitFor(check: () => boolean, ms = 2000) {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error('waitFor timed out')
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
  }
}

export async function renderWithQuery(
  ui: ReactNode,
  replies: Record<string, Reply>
) {
  const fetchMock = vi.fn((path: string, init: RequestInit) => {
    const r = replies[`${init.method ?? 'GET'} ${path}`]
    if (!r) throw new Error('unexpected ' + path)
    if (r === 'pending') return new Promise(() => {})
    return Promise.resolve({
      ok: r.status < 300,
      status: r.status,
      json: async () => r.body,
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  // Radix measures and scrolls elements; jsdom has neither API.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  Element.prototype.scrollIntoView ??= () => {}
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
  })
  await tick()
  return { el: container, fetchMock }
}

export function cleanup() {
  act(() => root?.unmount())
  container?.remove()
  root = container = undefined
  vi.unstubAllGlobals()
  vi.clearAllMocks()
}

export const button = (text: string, scope: ParentNode = document) =>
  [...scope.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === text
  ) as HTMLButtonElement | undefined

export const inputByLabel = (text: string) => {
  const label = [...document.querySelectorAll('label')].find(
    (l) => l.textContent === text
  )
  return document.getElementById(label?.htmlFor ?? '') as HTMLInputElement
}

export async function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value'
  )!.set!
  await act(async () => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

export async function click(el: Element) {
  await act(async () => {
    ;(el as HTMLElement).click()
  })
  await tick()
}

export async function keyDown(el: Element, key: string) {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
  await tick()
}

export const postedBody = (
  fetchMock: ReturnType<typeof vi.fn>,
  path: string
): unknown => {
  const call = fetchMock.mock.calls.find(
    ([p, init]) => p === path && (init as RequestInit).method === 'POST'
  )
  return call ? JSON.parse(String((call[1] as RequestInit).body)) : undefined
}
