import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { InvalidLinkPage } from './invalid-link-page'
import { NoLinkPage } from './no-link-page'

const FIRM = import.meta.env.VITE_APP_NAME ?? 'ResSpark'
let root: Root | undefined
let container: HTMLDivElement | undefined

async function render(node: ReactNode) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root!.render(node))
  return container
}

const hasAdminChrome = (el: HTMLElement) =>
  Boolean(el.querySelector('nav, aside, [data-sidebar]'))

describe('client-link pages', () => {
  afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
    document.title = ''
  })

  it('NoLinkPage shows the placeholder copy', async () => {
    const el = await render(<NoLinkPage />)
    expect(el.textContent).toContain('Nothing to do yet')
    expect(el.textContent).toContain(
      "Your agent will send you a link when there's something for you to complete. You can close this page."
    )
  })

  it('InvalidLinkPage shows the invalid-link copy', async () => {
    const el = await render(<InvalidLinkPage />)
    expect(el.textContent).toContain(
      'It may have expired or been replaced with a new one. Ask your agent for a new link.'
    )
    expect(el.textContent).toContain("This link isn't active")
  })

  it('renders no admin chrome (nav, aside, sidebar)', async () => {
    expect(hasAdminChrome(await render(<NoLinkPage />))).toBe(false)
    act(() => root?.unmount())
    expect(hasAdminChrome(await render(<InvalidLinkPage />))).toBe(false)
  })

  it('sets the tab title to the firm name only', async () => {
    await render(<NoLinkPage />)
    expect(document.title).toBe(FIRM)
  })

  it('adds a robots noindex meta tag', async () => {
    await render(<InvalidLinkPage />)
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex')
  })
})
