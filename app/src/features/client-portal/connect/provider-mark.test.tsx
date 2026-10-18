import { cleanup, renderWithQuery } from '@/test-utils/query-render'
import { afterEach, describe, expect, it } from 'vitest'
import { ProviderMark } from './provider-mark'

const mark = () => document.querySelector('[data-provider-mark]')

afterEach(cleanup)

describe('ProviderMark', () => {
  it('plaid: the trust line names Plaid with a decorative icon', async () => {
    await renderWithQuery(<ProviderMark id='plaid' />, {})
    expect(mark()!.textContent).toBe('Secure connection powered by Plaid')
    expect(mark()!.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('null: renders nothing', async () => {
    const { el } = await renderWithQuery(<ProviderMark id={null} />, {})
    expect(mark()).toBeNull()
    expect(el.innerHTML).toBe('')
  })
})
