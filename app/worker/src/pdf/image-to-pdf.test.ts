import { PDFDocument } from '@cantoo/pdf-lib'
import { describe, expect, it, vi } from 'vitest'
import { imageToPdf, sniffImage } from './image-to-pdf'
import { HEIC_STUB, TINY_JPEG, TINY_PNG } from './test-fixtures'

describe('sniffImage', () => {
  it('decides by magic bytes only', () => {
    expect(sniffImage(TINY_JPEG)).toBe('jpeg')
    expect(sniffImage(TINY_PNG)).toBe('png')
    expect(sniffImage(HEIC_STUB)).toBe('heic')
    expect(sniffImage(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBeNull()
    expect(sniffImage(new Uint8Array(3))).toBeNull()
  })

  it('recognises the other HEIF brands', () => {
    for (const brand of ['heix', 'mif1']) {
      const stub = HEIC_STUB.slice()
      stub.set(new TextEncoder().encode(brand), 8)
      expect(sniffImage(stub)).toBe('heic')
    }
  })
})

describe('imageToPdf', () => {
  it('makes one page per image, sized to the image in points', async () => {
    const bytes = await imageToPdf([
      { bytes: TINY_JPEG, kind: 'jpeg' },
      { bytes: TINY_PNG, kind: 'png' },
    ])
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(2)
    for (const page of doc.getPages()) {
      expect(page.getSize()).toEqual({ width: 1, height: 1 })
    }
  })

  it('writes the same bytes whatever the clock says', async () => {
    const make = async (at: string) => {
      vi.setSystemTime(new Date(at))
      return imageToPdf([{ bytes: TINY_JPEG, kind: 'jpeg' }])
    }
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      expect(await make('2026-10-11T12:05:00Z')).toEqual(await make('2026-10-11T12:00:00Z'))
    } finally {
      vi.useRealTimers()
    }
  })
})
