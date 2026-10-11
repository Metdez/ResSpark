import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QUESTION_BY_ID } from '../../../../shared/questions'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AnswerValue } from './intake-api'
import { QuestionControl } from './question-control'

let root: Root | undefined
let el: HTMLDivElement | undefined

function render(id: string, value: AnswerValue | undefined) {
  const onChange = vi.fn()
  el = document.createElement('div')
  document.body.append(el)
  root = createRoot(el)
  act(() => root!.render(<QuestionControl question={QUESTION_BY_ID[id]} value={value} onChange={onChange} />))
  return onChange
}
const buttons = () => [...el!.querySelectorAll('button')]
const byText = (t: string) => buttons().find((b) => b.textContent === t)!
const byLabel = (l: string) => el!.querySelector<HTMLButtonElement>(`button[aria-label="${l}"]`)!

afterEach(() => {
  act(() => root?.unmount())
  el?.remove()
})

describe('QuestionControl', () => {
  it('yes/no: two 44 px buttons that reflect the value with aria-pressed', () => {
    const onChange = render('owns_home', false)
    expect(buttons().map((b) => b.textContent)).toEqual(['Yes', 'No'])
    expect(byText('No').getAttribute('aria-pressed')).toBe('true')
    expect(byText('Yes').getAttribute('aria-pressed')).toBe('false')
    for (const b of buttons()) expect(b.className).toContain('h-11')
    act(() => byText('Yes').click())
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('choice: the four pay-frequency labels as buttons passing their values', () => {
    const onChange = render('pay_frequency', undefined)
    expect(buttons().map((b) => b.textContent)).toEqual(['Weekly', 'Every two weeks', 'Twice a month', 'Monthly'])
    act(() => byText('Every two weeks').click())
    expect(onChange).toHaveBeenCalledWith('biweekly')
  })

  it('stepper: labelled 44 px buttons that respect the minimum', () => {
    const onChange = render('household_size', undefined)
    expect(el!.querySelector('output')!.textContent).toBe('1')
    expect(byLabel('Fewer').disabled).toBe(true)
    for (const l of ['Fewer', 'More']) expect(byLabel(l).className).toContain('min-h-11')
    act(() => byLabel('More').click())
    expect(onChange).toHaveBeenCalledWith(2)
  })

  it('stepper: disables More at the maximum', () => {
    const onChange = render('vehicle_count', 50)
    expect(byLabel('More').disabled).toBe(true)
    act(() => byLabel('Fewer').click())
    expect(onChange).toHaveBeenCalledWith(49)
  })

  it('number: a 16 px numeric input labelled by the prompt that keeps digits only', () => {
    const onChange = render('age_taxpayer', 40)
    const input = el!.querySelector('input')!
    expect(input.getAttribute('inputmode')).toBe('numeric')
    expect(input.className).toContain('text-base')
    expect(input.getAttribute('aria-label')).toBe('What is your age?')
    expect(input.value).toBe('40')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setter.call(input, '4a5')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(onChange).toHaveBeenLastCalledWith(45)
    act(() => {
      setter.call(input, '')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(onChange).toHaveBeenLastCalledWith(undefined)
  })
})
