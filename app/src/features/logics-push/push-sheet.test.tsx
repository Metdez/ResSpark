import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import * as api from './api'
import { pushPlan, type PushableDoc } from './plan'
import { PushSheet } from './push-sheet'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), createPush: vi.fn() }))

const doc = (id: string, name: string, mime: string, size: number, pushAgain = false): PushableDoc => ({
  id,
  name,
  size_bytes: size,
  plan: pushPlan({ mime, size_bytes: size, name }),
  pushAgain,
})
const SELECTED = [
  doc('pdf1', 'stmt.pdf', 'application/pdf', 2048),
  doc('pdf2', 'big.pdf', 'application/pdf', 7 * 1024 * 1024),
  doc('heic', 'photo.heic', 'image/heic', 3000),
]

let root: Root | undefined
const onDone = vi.fn()

async function render(mode: 'fake' | 'live', selected = SELECTED) {
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(
      <QueryClientProvider client={new QueryClient()}>
        <PushSheet
          open
          onOpenChange={() => {}}
          requestId='r1'
          caseId='c1'
          agentName='Dana Agent'
          mode={mode}
          selected={selected}
          onDone={onDone}
        />
      </QueryClientProvider>
    )
  })
  return document.body.querySelector('[role="dialog"]') as HTMLElement
}

const button = (scope: HTMLElement, text: string) =>
  [...scope.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement
const click = (el: HTMLElement) =>
  act(async () => {
    el.click()
    await new Promise((r) => setTimeout(r, 0))
  })

afterEach(() => {
  act(() => root?.unmount())
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('PushSheet', () => {
  it('shows files, plans, the excluded HEIC, the comment and the note preview', async () => {
    const sheet = await render('fake')
    expect(sheet.textContent).toContain('Push to Logics (simulated)')
    expect(sheet.textContent).toContain('Review what will land in the Logics case.')
    expect(sheet.textContent).toContain('stmt.pdf · 2 KB · Sends as 1 file')
    expect(sheet.textContent).toContain('big.pdf · 7.0 MB · Will split into about 2 parts')
    const heic = sheet.querySelector('[data-sheet-row="heic"]')!.textContent
    expect(heic).toContain('Needs manual compression — Ask the client to re-upload as JPG or PDF.')
    expect(heic).toContain("Won't be sent")
    expect(sheet.textContent).toContain('Uploaded via ResSpark by Dana Agent — stmt.pdf')
    expect(sheet.querySelector('[data-note-preview]')!.textContent).toBe(
      'Documents uploaded via ResSpark by Dana Agent: stmt.pdf, big.pdf (part 1 of 2), big.pdf (part 2 of 2)'
    )
    expect(sheet.textContent).toContain('IDs are added automatically.')
    expect(sheet.textContent).not.toContain('This will write to the Logics case.')
  })

  it('pushes only the sendable files, then toasts and calls onDone', async () => {
    vi.mocked(api.createPush).mockResolvedValue({ batch_id: 'b1', push_ids: ['p1', 'p2'], mode: 'fake' })
    const sheet = await render('fake')
    await click(button(sheet, 'Push 2 files'))
    expect(api.createPush).toHaveBeenCalledWith('r1', { document_ids: ['pdf1', 'pdf2'] })
    expect(toast.success).toHaveBeenCalledWith('Push started')
    expect(onDone).toHaveBeenCalled()
  })

  it('forwards push_again ids', async () => {
    vi.mocked(api.createPush).mockResolvedValue({ batch_id: 'b1', push_ids: ['p1'], mode: 'fake' })
    const sheet = await render('fake', [doc('pdf1', 'stmt.pdf', 'application/pdf', 2048, true)])
    await click(button(sheet, 'Push 1 file'))
    expect(api.createPush).toHaveBeenCalledWith('r1', { document_ids: ['pdf1'], push_again: ['pdf1'] })
  })

  it('shows the server message when writes are blocked', async () => {
    vi.mocked(api.createPush).mockRejectedValue(
      new ApiError(403, 'logics_write_blocked', 'Case 123 is not on the test allowlist')
    )
    const sheet = await render('fake')
    await click(button(sheet, 'Push 2 files'))
    expect(sheet.querySelector('[role="alert"]')!.textContent).toContain('Case 123 is not on the test allowlist')
    expect(onDone).not.toHaveBeenCalled()
  })

  it('explains already_pushed with our copy', async () => {
    vi.mocked(api.createPush).mockRejectedValue(new ApiError(409, 'already_pushed', 'already_pushed'))
    const sheet = await render('fake')
    await click(button(sheet, 'Push 2 files'))
    expect(sheet.textContent).toContain('Already pushed. Tick "Push again" to send it anyway.')
  })

  it('warns about a real write in live mode', async () => {
    const sheet = await render('live')
    expect(sheet.querySelector('h2')!.textContent).toBe('Push to Logics')
    expect(sheet.textContent).toContain('This will write to the Logics case.')
  })
})
