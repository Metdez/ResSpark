import { button, cleanup, click, renderWithQuery } from '@/test-utils/query-render'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CONSENT_TEXT } from '@/lib/consent-text'
import { ConsentSheet } from './consent-sheet'

const T = CONSENT_TEXT.payroll_data
const dialog = () => document.querySelector('[role="dialog"]')!

afterEach(cleanup)

const render = (busy: boolean, onAgree = vi.fn()) =>
  renderWithQuery(
    <ConsentSheet kind='payroll_data' firmName='ValorTax' open busy={busy} onAgree={onAgree} onClose={() => {}} />,
    {}
  )

describe('ConsentSheet', () => {
  it('shows the title, body, and the detail with the firm name', async () => {
    await render(false)
    const t = dialog().textContent
    expect(t).toContain(T.title)
    expect(t).toContain(T.body)
    expect(t).toContain('ValorTax receives this information')
    expect(t).not.toContain('{firm}')
  })

  it('has one 44 px I agree button and a Not now button', async () => {
    await render(false)
    const agrees = [...dialog().querySelectorAll('button')].filter((b) => b.textContent === 'I agree')
    expect(agrees).toHaveLength(1)
    expect(agrees[0].className).toContain('h-11')
    expect(button('Not now', dialog())).toBeDefined()
  })

  it('busy shows Saving… disabled; I agree calls onAgree', async () => {
    await render(true)
    const saving = button('Saving…', dialog())!
    expect(saving.disabled).toBe(true)
    cleanup()
    const onAgree = vi.fn()
    await render(false, onAgree)
    await click(button('I agree', dialog())!)
    expect(onAgree).toHaveBeenCalledOnce()
  })
})
