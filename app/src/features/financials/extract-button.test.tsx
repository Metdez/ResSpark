import { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { button, cleanup, click, renderWithQuery, waitFor } from '@/test-utils/query-render'
import * as api from './api'
import type { ExtractResult } from './api'
import { ExtractButton } from './extract-button'

vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), extractValues: vi.fn() }))

const RESULT: ExtractResult = {
  documents: 3,
  parsed: 2,
  failed: [{ document_id: 'd3', name: 'scan.pdf', reason: 'no_template' }],
  skipped: [{ document_id: 'd4', name: 'photo.png', reason: 'not_pdf' }],
  proposals: { inserted: 4, kept: 1, superseded: 0 },
}
afterEach(cleanup)

describe('ExtractButton', () => {
  it('is disabled while reading, then toasts the summary, lists unread files in plain words and refreshes the view', async () => {
    let resolve!: (r: ExtractResult) => void
    vi.mocked(api.extractValues).mockReturnValue(new Promise((r) => (resolve = r)))
    const invalidate = vi.spyOn(QueryClient.prototype, 'invalidateQueries')
    const { el } = await renderWithQuery(<ExtractButton caseId='C1' />, {})

    await click(button('Extract values')!)
    expect(api.extractValues).toHaveBeenCalledWith('C1')
    expect(button('Reading documents…')?.disabled).toBe(true)

    resolve(RESULT)
    await waitFor(() => Boolean(button('Extract values')))
    expect(toast.success).toHaveBeenCalledWith('Read 2 of 3 documents. 4 new values proposed.')
    expect([...el.querySelectorAll('[aria-label="Documents not read"] li')].map((li) => li.textContent)).toEqual([
      'scan.pdf: No matching template',
      'photo.png: Not a PDF',
    ])
    expect(el.textContent).not.toMatch(/no_template|not_pdf/)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['financials', 'C1'] })
  })

  it('maps every reason code to plain copy', async () => {
    vi.mocked(api.extractValues).mockResolvedValue({
      ...RESULT,
      failed: [
        { document_id: 'a', name: 'a.pdf', reason: 'missing_fields' },
        { document_id: 'b', name: 'b.pdf', reason: 'unreadable' },
      ],
      skipped: [{ document_id: 'c', name: 'c.pdf', reason: 'too_large' }],
    })
    const { el } = await renderWithQuery(<ExtractButton caseId='C1' />, {})
    await click(button('Extract values')!)
    await waitFor(() => el.querySelectorAll('li').length === 3)
    expect([...el.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'a.pdf: Required values not found',
      'b.pdf: Could not read this PDF',
      'c.pdf: Too large',
    ])
  })
})

describe('isExtractResult', () => {
  it('accepts the Worker shape and rejects unknown reasons', () => {
    expect(api.isExtractResult(RESULT)).toBe(true)
    expect(api.isExtractResult({ ...RESULT, failed: [{ document_id: 'x', name: 'x', reason: 'boom' }] })).toBe(false)
    expect(api.isExtractResult({ ...RESULT, proposals: null })).toBe(false)
  })
})
