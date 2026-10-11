import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { TONE_CLASSES } from '@/lib/status'
import { PushStatusBadge, type PushState } from './status-badge'

let root: Root | undefined
let container: HTMLDivElement

function render(state: PushState) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root!.render(<PushStatusBadge state={state} />))
  return container.firstElementChild as HTMLElement
}

afterEach(() => {
  act(() => root?.unmount())
  container.remove()
})

describe('PushStatusBadge', () => {
  it.each([
    ['queued', 'muted', 'Queued'],
    ['sending', 'info', 'Sending'],
    ['sent', 'success', 'Sent'],
    ['failed', 'destructive', 'Failed'],
    ['unknown', 'warning', 'Unknown'],
  ] as const)('%s renders the %s tone with label %s', (state, tone, label) => {
    const el = render(state)
    expect(el.textContent).toBe(label)
    expect(el.className).toContain(TONE_CLASSES[tone].split(' ')[0])
  })

  it('spins an icon only while sending', () => {
    expect(render('sending').querySelector('svg.animate-spin')).not.toBeNull()
    act(() => root?.unmount())
    expect(render('sent').querySelector('svg')).toBeNull()
  })
})
