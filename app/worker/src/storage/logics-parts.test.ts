import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAdminClient } from '../db/client'
import { downloadPart, partPath, uploadPart } from './logics-parts'

vi.mock('../db/client', () => ({ createAdminClient: vi.fn() }))

const ENV = {} as Env
const bucket = (over: Record<string, unknown>) => {
  const from = vi.fn(() => over)
  vi.mocked(createAdminClient).mockReturnValue({ storage: { from } } as unknown as ReturnType<typeof createAdminClient>)
  return from
}

afterEach(() => vi.clearAllMocks())

describe('logics parts storage', () => {
  it('partPath builds the D-06 layout', () => {
    expect(partPath({ firm_id: 'f', case_id: 'c', document_id: 'd', part_index: 2 })).toBe('firm/f/case/c/logics/d/part-2.pdf')
  })

  it('uploadPart upserts a PDF into case-documents', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null })
    const from = bucket({ upload })
    const bytes = new Uint8Array([1])
    await uploadPart(ENV, 'p', bytes)
    expect(from).toHaveBeenCalledWith('case-documents')
    expect(upload).toHaveBeenCalledWith('p', bytes, { contentType: 'application/pdf', upsert: true })
  })

  it('uploadPart throws storage_write_failed on an error', async () => {
    bucket({ upload: vi.fn().mockResolvedValue({ error: { message: 'x' } }) })
    await expect(uploadPart(ENV, 'p', new Uint8Array())).rejects.toThrow('storage_write_failed')
  })

  it('downloadPart returns bytes, or throws storage_read_failed', async () => {
    bucket({ download: vi.fn().mockResolvedValue({ data: new Blob([new Uint8Array([7, 8])]), error: null }) })
    expect([...(await downloadPart(ENV, 'p'))]).toEqual([7, 8])
    bucket({ download: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }) })
    await expect(downloadPart(ENV, 'p')).rejects.toThrow('storage_read_failed')
  })
})
