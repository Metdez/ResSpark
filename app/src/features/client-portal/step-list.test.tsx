import {
  button,
  cleanup,
  click,
  renderWithQuery,
  waitFor,
} from '@/test-utils/query-render'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PortalStep } from './portal-api'
import { StepList } from './step-list'

vi.mock('@/features/uploads/upload-sheet', () => ({
  UploadSheet: ({ item }: { item: { label: string } }) => (
    <div data-testid='upload-sheet'>{item.label}</div>
  ),
}))

vi.mock('./address/address-sheet', () => ({
  AddressSheet: ({ step }: { step: { label: string } }) => (
    <div role='dialog' data-testid='address-sheet'>
      {step.label}
    </div>
  ),
}))

const STEPS: PortalStep[] = [
  {
    id: 's1',
    position: 1,
    kind: 'intake',
    label: 'Answer a few questions',
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
    await renderWithQuery(<StepList firmName='ValorTax' steps={STEPS} onView={onView} />, {})
    expect(text()).not.toContain('Coming next')
    await click(viewOf('Answer a few questions'))
    await waitFor(() => text().includes('Coming next'))
    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog.textContent).toContain('Answer a few questions')
    expect(dialog.textContent).toContain(BODY)
    expect(button('Close', dialog)!.className).toContain('h-11')
    expect(onView).toHaveBeenCalledWith(STEPS[0])
  })

  it('Close hides the sheet', async () => {
    await renderWithQuery(<StepList firmName='ValorTax' steps={STEPS} />, {})
    await click(viewOf('Answer a few questions'))
    await waitFor(() => text().includes('Coming next'))
    await click(button('Close', document.querySelector('[role="dialog"]')!)!)
    await waitFor(() => !text().includes('Coming next'))
  })

  it('hides the vendored 16 px icon close, leaving the 44 px Close', async () => {
    await renderWithQuery(<StepList firmName='ValorTax' steps={STEPS} />, {})
    await click(viewOf('Answer a few questions'))
    await waitFor(() => text().includes('Coming next'))
    const dialog = document.querySelector('[role="dialog"]')!
    // the vendored SheetContent appends its icon close as the last child
    expect(dialog.lastElementChild!.tagName).toBe('BUTTON')
    expect(dialog.lastElementChild!.className).not.toContain('h-11')
    expect(dialog.className).toContain('[&>button:last-child]:hidden')
  })
})

describe('StepList upload step', () => {
  const stub = () => document.querySelector('[data-testid="upload-sheet"]')

  it('View on an upload step opens UploadSheet, not Coming next', async () => {
    await renderWithQuery(<StepList firmName='ValorTax' steps={STEPS} />, {})
    await click(viewOf('Upload your ID'))
    await waitFor(() => stub() !== null)
    expect(stub()!.textContent).toBe('Upload your ID')
    expect(text()).not.toContain('Coming next')
  })

  it('View on a step with no sheet yet still opens Coming next and no UploadSheet', async () => {
    await renderWithQuery(<StepList firmName='ValorTax' steps={STEPS} />, {})
    await click(viewOf('Answer a few questions'))
    await waitFor(() => text().includes('Coming next'))
    expect(stub()).toBeNull()
  })
})

describe('StepList address step', () => {
  it('View on an address step opens the address sheet titled with the step label', async () => {
    const step: PortalStep = { id: 's3', position: 3, kind: 'address', label: 'Confirm your address', required: true, status: 'pending' }
    await renderWithQuery(<StepList firmName='ValorTax' steps={[...STEPS, step]} />, {})
    await click(viewOf('Confirm your address'))
    await waitFor(() => document.querySelector('[data-testid="address-sheet"]') !== null)
    expect(document.querySelector('[role="dialog"]')!.textContent).toBe('Confirm your address')
    expect(text()).not.toContain('Coming next')
  })
})

describe('StepList connect steps', () => {
  const payroll: PortalStep = { id: 's4', position: 4, kind: 'payroll_connect', label: 'Connect your payroll', required: true, status: 'pending' }
  const bank: PortalStep = { id: 's5', position: 5, kind: 'bank_connect', label: 'Connect your bank', required: true, status: 'pending' }
  const CONNECTION = {
    status: 200,
    body: { provider: { id: 'truv', configured: true, capabilities: null }, consented: false, connection: null },
  }

  it('View on the payroll step opens the payroll sheet, not Coming next', async () => {
    await renderWithQuery(<StepList firmName='ValorTax' steps={[...STEPS, payroll]} />, {
      'GET /api/c/items/s4/connection': CONNECTION,
    })
    await click(viewOf('Connect your payroll'))
    await waitFor(() => button('Connect payroll') !== undefined)
    expect(text()).not.toContain('Coming next')
  })

  it('View on the bank step opens the bank sheet with the upload fallback', async () => {
    await renderWithQuery(<StepList firmName='ValorTax' steps={[...STEPS, bank]} />, {})
    await click(viewOf('Connect your bank'))
    await waitFor(() => button('Upload statements instead') !== undefined)
    expect(text()).not.toContain('Coming next')
  })

  it('View on a step with no sheet yet still opens Coming next', async () => {
    await renderWithQuery(<StepList firmName='ValorTax' steps={[...STEPS, payroll]} />, {})
    await click(viewOf('Answer a few questions'))
    await waitFor(() => text().includes('Coming next'))
  })
})
