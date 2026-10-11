import { describe, expect, it } from 'vitest'
import { objectPath, safeName, sniffType } from './case-documents'

const bytes = (...b: number[]) => new Uint8Array(b)
const ascii = (s: string) => new TextEncoder().encode(s)

describe('safeName', () => {
  it('keeps only the base name', () => expect(safeName('../../etc/passwd')).toBe('passwd'))
  it('replaces unsafe characters and collapses underscores', () =>
    expect(safeName('My Statement (Jan).PDF')).toBe('My_Statement_Jan_.PDF'))
  it('strips leading dots', () => expect(safeName('.hidden')).toBe('hidden'))
  it('falls back to file when nothing is left', () => {
    expect(safeName('')).toBe('file')
    expect(safeName('...')).toBe('file')
  })
  it('caps the length at 80', () => expect(safeName('a'.repeat(200) + '.pdf').length).toBeLessThanOrEqual(80))
})

describe('objectPath', () => {
  it('builds the D-01 layout from ids and the safe name', () => {
    const path = objectPath({ firm_id: 'f', case_id: 'c', request_item_id: 'i', document_id: 'd', name: '../x/../My File.pdf' })
    expect(path).toBe('firm/f/case/c/item/i/d/My_File.pdf')
    expect(path).not.toContain('..')
  })
})

describe('sniffType', () => {
  it('detects PDF, JPEG and PNG', () => {
    expect(sniffType(ascii('%PDF-1.7\n'))).toBe('application/pdf')
    expect(sniffType(bytes(0xff, 0xd8, 0xff, 0xdb))).toBe('image/jpeg')
    expect(sniffType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png')
  })
  it('rejects GIF89a, short input and empty input', () => {
    expect(sniffType(ascii('GIF89a'))).toBeNull()
    expect(sniffType(bytes(0x25, 0x50, 0x44))).toBeNull()
    expect(sniffType(new Uint8Array())).toBeNull()
  })
})
