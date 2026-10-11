import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReviewResponse } from './api'
import { MirrorCard, mirrorState } from './mirror-card'
import { useReview } from './use-review'

vi.mock('./use-review', () => ({ useReview: vi.fn() }))

const NOW = Date.parse('2026-10-11T12:00:00Z')
const minAgo = (m: number) => new Date(NOW - m * 60_000).toISOString()
const OPENED = '2026-10-11T11:00:00Z'
const session = (m: number, over: Partial<NonNullable<ReviewResponse['client_session']>> = {}) => ({
  last_step: 'upload',
  last_error: null,
  seen_at: minAgo(m),
  ...over,
})

describe('mirrorState', () => {
  it('is not_opened with no session and no opened_at', () => {
    expect(mirrorState({ opened_at: null, status: 'sent', session: null }, NOW)).toEqual({ kind: 'not_opened' })
  })

  it('is no_session once opened but before any heartbeat', () => {
    expect(mirrorState({ opened_at: OPENED, status: 'opened', session: null }, NOW)).toEqual({ kind: 'no_session' })
  })

  it.each([
    [2, 'in_progress', false],
    [11, 'in_progress', true],
    [11, 'complete', false],
    [11, 'revoked', false],
    [10, 'in_progress', false],
  ])('seen %i min ago with status %s → stuck %s', (m, status, stuck) => {
    const s = mirrorState({ opened_at: OPENED, status, session: session(m) }, NOW)
    expect(s).toMatchObject({ kind: 'active', step: 'upload', stuck })
  })

  it('is never stuck before the link was opened', () => {
    const s = mirrorState({ opened_at: null, status: 'sent', session: session(30, { last_step: 'intro' }) }, NOW)
    expect(s).toMatchObject({ kind: 'active', stuck: false })
  })
})

describe('MirrorCard', () => {
  let root: Root | undefined
  let container: HTMLDivElement

  afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
    vi.useRealTimers()
  })

  async function render(opened_at: string | null, client_session: ReviewResponse['client_session'], status = 'in_progress') {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    const data: ReviewResponse = { request: { id: 'r1', case_id: 'c1', status, opened_at }, items: [], client_session }
    vi.mocked(useReview).mockReturnValue({ data } as ReturnType<typeof useReview>)
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => root!.render(<MirrorCard requestId='r1' />))
    return container
  }
  const q = (sel: string) => container.querySelector(sel)

  it('shows the step, the mapped error, and no stuck hint for a recent session', async () => {
    await render(OPENED, session(2, { last_error: 'state_failed' }))
    expect(q('[data-mirror-step]')!.textContent).toBe('Client is on: upload — last seen 2 min ago')
    expect(q('[data-mirror-step] span')!.getAttribute('title')).toBe(minAgo(2))
    expect(q('[data-mirror-error]')!.textContent).toBe("Last error: Couldn't load the page")
    expect(q('[data-mirror-stuck]')).toBeNull()
  })

  it.each([
    ['list', 'Client is on: the step list'],
    ['bank_connect', 'Client is on: bank connect'],
  ])('reads step %s as words', async (step, text) => {
    await render(OPENED, session(2, { last_step: step }))
    expect(q('[data-mirror-step]')!.textContent).toContain(text)
  })

  it('falls back to the words of an unknown error code', async () => {
    await render(OPENED, session(2, { last_error: 'foo_bar' }))
    expect(q('[data-mirror-error]')!.textContent).toBe('Last error: foo bar')
  })

  it('renders no error line when last_error is null', async () => {
    await render(OPENED, session(2))
    expect(q('[data-mirror-error]')).toBeNull()
  })

  it('shows the red stuck hint after 10 minutes of silence', async () => {
    await render(OPENED, session(11))
    const hint = q('[data-mirror-stuck]')!
    expect(hint.textContent).toContain('Client may be stuck')
    expect(hint.className).toContain('text-red-700')
  })

  it('says the link is not opened yet', async () => {
    await render(null, null, 'sent')
    expect(container.textContent).toContain("Client hasn't opened the link yet")
  })

  it('says there is no activity yet once opened', async () => {
    await render(OPENED, null, 'opened')
    expect(container.textContent).toContain('No activity in this session yet')
  })
})
