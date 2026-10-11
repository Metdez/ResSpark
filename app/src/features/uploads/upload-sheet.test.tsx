import { act } from 'react'
import {
  button,
  cleanup,
  click,
  renderWithQuery,
  waitFor,
} from '@/test-utils/query-render'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  completeUpload,
  listItemDocuments,
  mintUpload,
  type ItemDocuments,
} from './api'
import { uploadBlob } from './transport'
import { UploadSheet } from './upload-sheet'

vi.mock('./api', () => ({
  mintUpload: vi.fn(),
  remintToken: vi.fn(),
  completeUpload: vi.fn(),
  listItemDocuments: vi.fn(),
}))
vi.mock('./transport', () => ({
  uploadBlob: vi.fn(),
  pendingKey: (f: File) => `${f.name}|${f.size}|${f.lastModified}`,
  readPending: () => ({}),
  writePending: vi.fn(),
  clearPending: vi.fn(),
}))
vi.mock('./preprocess', () => ({
  preprocess: vi.fn(async (file: File) => ({
    blob: file,
    mime: 'application/pdf',
    name: file.name,
  })),
  sha256Hex: vi.fn(async () => 'a'.repeat(64)),
}))

const ITEM = { id: 'I1', label: 'Upload your ID', status: 'pending' }
const listing = (
  status: string,
  note: string | null,
  documents: ItemDocuments['documents'] = []
): ItemDocuments => ({
  item: { id: 'I1', label: ITEM.label, status, rejection_note: note },
  documents,
})
const pdf = (name: string) =>
  new File(['%PDF-1.7'], name, { type: 'application/pdf', lastModified: 1 })
const text = () => document.body.textContent ?? ''
const cameraInput = () =>
  document.querySelector<HTMLInputElement>('input[type="file"][capture]')!
const rows = () => [...document.querySelectorAll('[data-file-row]')]

async function pick(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, 'files', { value: files, configurable: true })
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

async function open(item = ITEM, onClose = vi.fn()) {
  await renderWithQuery(<UploadSheet item={item} open onClose={onClose} />, {})
  await waitFor(() => vi.mocked(listItemDocuments).mock.calls.length > 0)
  return onClose
}

beforeEach(() => {
  vi.mocked(listItemDocuments).mockResolvedValue(listing('pending', null))
  let n = 0
  vi.mocked(mintUpload).mockImplementation(async () => {
    n++
    return { document_id: `D${n}`, path: `p${n}`, token: 't', signed_url: 'u' }
  })
  vi.mocked(uploadBlob).mockResolvedValue(undefined)
  vi.mocked(completeUpload).mockResolvedValue({
    document_status: 'ready',
    item_status: 'submitted',
    request_status: 'waiting_on_staff',
  })
})
afterEach(cleanup)

describe('UploadSheet', () => {
  it('renders the label, intro, both controls and a disabled Done', async () => {
    await open()
    expect(text()).toContain('Upload your ID')
    expect(text()).toContain(
      'Take a photo of each page or choose files from your phone.'
    )
    expect(button('Take photo or choose files')!.className).toContain('h-14')
    const cam = cameraInput()
    expect(cam.getAttribute('accept')).toBe('image/*,.pdf,.heic,.heif')
    expect(cam.getAttribute('capture')).toBe('environment')
    expect(cam.multiple).toBe(true)
    expect(button('Choose from files')!.className).toContain('h-11')
    const inputs = document.querySelectorAll('input[type="file"]')
    expect(inputs).toHaveLength(2)
    expect(inputs[1].hasAttribute('capture')).toBe(false)
    expect(button('Done with this item')!.disabled).toBe(true)
  })

  it('uploads two files in parallel, then enables Done', async () => {
    const onClose = await open()
    await pick(cameraInput(), [pdf('a.pdf'), pdf('b.pdf')])
    await waitFor(
      () =>
        rows().every((r) => r.textContent!.includes('Sent to your agent')) &&
        rows().length === 2
    )
    expect(mintUpload).toHaveBeenCalledTimes(2)
    expect(uploadBlob).toHaveBeenCalledTimes(2)
    expect(completeUpload).toHaveBeenCalledWith('D1', {
      sha256: 'a'.repeat(64),
      size: 8,
    })
    const done = button('Done with this item')!
    expect(done.disabled).toBe(false)
    await click(done)
    expect(onClose).toHaveBeenCalled()
  })

  it('does nothing when zero files are chosen', async () => {
    await open()
    await pick(cameraInput(), [])
    expect(rows()).toHaveLength(0)
    expect(mintUpload).not.toHaveBeenCalled()
  })

  it('refuses a .txt before any API call', async () => {
    await open()
    await pick(cameraInput(), [
      new File(['x'], 'notes.txt', { type: 'text/plain' }),
    ])
    await waitFor(() =>
      text().includes('We can take PDFs and photos (JPG, PNG, HEIC).')
    )
    expect(mintUpload).not.toHaveBeenCalled()
    expect(button('Remove')).toBeDefined()
  })

  it('shows the 10-file limit in plain words', async () => {
    vi.mocked(mintUpload).mockRejectedValueOnce(
      Object.assign(new Error('x'), { status: 409, code: 'too_many_files' })
    )
    await open()
    await pick(cameraInput(), [pdf('a.pdf')])
    await waitFor(() =>
      text().includes('You can add up to 10 files for this item.')
    )
  })

  it('keeps one file ready when its sibling fails', async () => {
    vi.mocked(uploadBlob).mockImplementation(async (t) => {
      if (t.document_id === 'D1')
        throw Object.assign(new Error('n'), { code: 'network' })
    })
    await open()
    await pick(cameraInput(), [pdf('a.pdf'), pdf('b.pdf')])
    await waitFor(
      () =>
        text().includes('Sent to your agent') && text().includes('Try again')
    )
    const [a, b] = rows()
    expect(a.textContent).toContain('Try again')
    expect(b.textContent).toContain('Sent to your agent')
  })

  it('shows the agent note on a rejected item and offers Upload again', async () => {
    vi.mocked(listItemDocuments).mockResolvedValue(
      listing('rejected', 'blurry', [
        {
          id: 'X1',
          name: 'old.jpg',
          mime: 'image/jpeg',
          size_bytes: 2048,
          status: 'rejected',
          uploaded_at: '2026-10-11T09:00:00Z',
        },
      ])
    )
    await open({ ...ITEM, status: 'rejected' })
    await waitFor(() =>
      text().includes('Your agent asked for a new copy: blurry')
    )
    expect(button('Upload again')).toBeDefined()
    expect(rows()[0].textContent).toContain('Needs a new copy')
  })

  it('shows approval and no file input on an approved item', async () => {
    vi.mocked(listItemDocuments).mockResolvedValue(listing('approved', null))
    await open({ ...ITEM, status: 'approved' })
    await waitFor(() => text().includes('Your agent approved this.'))
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })

  it('lists files already uploaded, in the order returned, before new ones', async () => {
    vi.mocked(listItemDocuments).mockResolvedValue(
      listing('submitted', null, [
        {
          id: 'X1',
          name: 'first.pdf',
          mime: 'application/pdf',
          size_bytes: 10,
          status: 'ready',
          uploaded_at: '2026-10-11T09:00:00Z',
        },
        {
          id: 'X2',
          name: 'second.pdf',
          mime: 'application/pdf',
          size_bytes: 10,
          status: 'ready',
          uploaded_at: '2026-10-11T09:01:00Z',
        },
      ])
    )
    await open({ ...ITEM, status: 'submitted' })
    await waitFor(() => rows().length === 2)
    await pick(cameraInput(), [pdf('third.pdf')])
    await waitFor(() => rows().length === 3)
    expect(
      rows().map((r) => r.querySelector('[title]')!.getAttribute('title'))
    ).toEqual(['first.pdf', 'second.pdf', 'third.pdf'])
  })
})
