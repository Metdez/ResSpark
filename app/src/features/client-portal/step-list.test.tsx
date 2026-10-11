import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  button,
  cleanup,
  click,
  renderWithQuery,
  waitFor,
} from '@/test-utils/query-render'
import type { PortalStep } from './portal-api'
import { StepList } from './step-list'

const STEPS: PortalStep[] = [
  {
    id: 's1',
    position: 1,
    kind: 'bank_connect',
    label: 'Connect your bank',
    required: true,
    status: 'pending',
  },
  {
    id: 's2',
    position: 2,
    kind: 'upload',
    label: 'Upload your ID',
    required: true,
    status: 'pending',
  },
]
const BODY =
  "This step isn't ready yet. Your agent will tell you when it is. You can close this page."
const text = () => document.body.textContent ?? ''
const viewOf = (label: string) =>
  document.querySelector(`button[aria-label="View ${label}"]`)!

afterEach(cleanup)

describe('StepList Coming next sheet', () => {
  it('View opens the sheet with the step, the copy and a 44 px Close', async () => {
    const onView = vi.fn()
    await renderWithQuery(<StepList steps={STEPS} onView={onView} />, {})
    expect(text()).not.toContain('Coming next')
    await click(viewOf('Connect your bank'))
    await waitFor(() => text().includes('Coming next'))
    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog.textContent).toContain('Connect your bank')
    expect(dialog.textContent).toContain(BODY)
    expect(button('Close', dialog)!.className).toContain('h-11')
    expect(onView).toHaveBeenCalledWith(STEPS[0])
  })

  it('Close hides the sheet', async () => {
    await renderWithQuery(<StepList steps={STEPS} />, {})
    await click(viewOf('Upload your ID'))
    await waitFor(() => text().includes('Coming next'))
    await click(button('Close', document.querySelector('[role="dialog"]')!)!)
    await waitFor(() => !text().includes('Coming next'))
  })

  it('hides the vendored 16 px icon close, leaving the 44 px Close', async () => {
    await renderWithQuery(<StepList steps={STEPS} />, {})
    await click(viewOf('Connect your bank'))
    await waitFor(() => text().includes('Coming next'))
    const dialog = document.querySelector('[role="dialog"]')!
    // the vendored SheetContent appends its icon close as the last child
    expect(dialog.lastElementChild!.tagName).toBe('BUTTON')
    expect(dialog.lastElementChild!.className).not.toContain('h-11')
    expect(dialog.className).toContain('[&>button:last-child]:hidden')
  })
})
