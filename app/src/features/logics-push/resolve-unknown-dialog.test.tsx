import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import * as api from './api'
import type { LedgerPush } from './api'
import { ResolveUnknownDialog } from './resolve-unknown-dialog'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), resolvePush: vi.fn() }))

const PUSH: LedgerPush = {
  id: 'p1',
  document_id: 'd1',
  part_index: 0,
  part_count: null,
  file_name: 'stmt.pdf',
  state: 'unknown',
  mode: 'fake',
  logics_document_id: null,
  error_code: 'timeout',
  error_detail: null,
  needs_manual_compression: false,
  attempts: 1,
  claimed_at: '2026-10-11T13:00:00Z',
  sent_at: null,
  resolved_by: null,
  created_at: '2026-10-11T12:59:00Z',
}

let root: Root | undefined
const onOpenChange = vi.fn()

async function render(push: LedgerPush = PUSH, allowMarkSent = true) {
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(
      <QueryClientProvider client={new QueryClient()}>
        <ResolveUnknownDialog
          push={push}
          onOpenChange={onOpenChange}
          requestId='r1'
          caseId='c1'
          allowMarkSent={allowMarkSent}
        />
      </QueryClientProvider>
    )
  })
  return document.body.querySelector('[role="dialog"]') as HTMLElement
}

const buttons = (scope: HTMLElement) => [...scope.querySelectorAll('button')].map((b) => b.textContent?.trim())
const button = (scope: HTMLElement, text: string) =>
  [...scope.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement
const click = (el: HTMLElement) =>
  act(async () => {
    el.click()
    await new Promise((r) => setTimeout(r, 0))
  })
async function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

afterEach(() => {
  act(() => root?.unmount())
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('ResolveUnknownDialog', () => {
  it('says what is unknown and offers exactly two decisions plus Cancel, with Cancel focused', async () => {
    const dialog = await render()
    expect(dialog.textContent).toContain("Logics didn't confirm this file")
    expect(dialog.textContent).toContain('did not get a readable answer')
    expect(dialog.textContent).toContain('Logics may or may not have stored it')
    expect(dialog.textContent).toContain('Nobody can look it up by API.')
    expect(dialog.textContent).toContain('Marks this file as sent.')
    expect(dialog.textContent).toContain('Re-send may create a duplicate in Logics if the first upload did arrive.')
    const actions = buttons(dialog).filter((t) => t !== 'Close')
    expect(actions).toEqual(["I checked Logics — it's there", 'Re-send', 'Cancel'])
    expect(document.activeElement?.textContent).toBe('Cancel')
  })

  it('marks sent with the typed CaseDocumentID', async () => {
    vi.mocked(api.resolvePush).mockResolvedValue({ state: 'sent', new_push_id: null })
    const dialog = await render()
    const label = [...dialog.querySelectorAll('label')].find((l) => l.textContent === 'CaseDocumentID (optional)')!
    await type(document.getElementById(label.htmlFor) as HTMLInputElement, '128346')
    await click(button(dialog, "I checked Logics — it's there"))
    expect(api.resolvePush).toHaveBeenCalledWith('p1', { action: 'mark_sent', logics_document_id: 128346 })
    expect(toast.success).toHaveBeenCalledWith('Marked as sent')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('marks sent without an id key when the field is empty', async () => {
    vi.mocked(api.resolvePush).mockResolvedValue({ state: 'sent', new_push_id: null })
    const dialog = await render()
    await click(button(dialog, "I checked Logics — it's there"))
    expect(api.resolvePush).toHaveBeenCalledWith('p1', { action: 'mark_sent' })
  })

  it('re-sends', async () => {
    vi.mocked(api.resolvePush).mockResolvedValue({ state: 'failed', new_push_id: 'p2' })
    const dialog = await render()
    await click(button(dialog, 'Re-send'))
    expect(api.resolvePush).toHaveBeenCalledWith('p1', { action: 'resend' })
    expect(toast.success).toHaveBeenCalledWith('Re-send queued')
  })

  it('offers only Re-send for a failed row', async () => {
    const dialog = await render({ ...PUSH, state: 'failed', error_detail: 'Logics refused the file' }, false)
    expect(button(dialog, "I checked Logics — it's there")).toBeUndefined()
    expect(dialog.textContent).toContain(
      'This file failed to send (Logics refused the file). Re-send creates a new attempt with the same bytes.'
    )
  })

  it('explains not_resolvable', async () => {
    vi.mocked(api.resolvePush).mockRejectedValue(new ApiError(409, 'not_resolvable', 'not_resolvable'))
    const dialog = await render()
    await click(button(dialog, 'Re-send'))
    expect(dialog.querySelector('[role="alert"]')!.textContent).toContain(
      'This file was already resolved. Refresh to see its state.'
    )
  })
})
