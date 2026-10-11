import { describe, expect, it } from 'vitest'
import { acceptFile } from './accept'

describe('acceptFile', () => {
  it('takes a PDF by extension when iOS leaves the type empty', () => {
    expect(acceptFile({ name: 'a.PDF', type: '', size: 10 })).toEqual({
      ok: true,
      kind: 'pdf',
    })
  })

  it('classifies HEIC and HEIF photos as heic', () => {
    expect(
      acceptFile({ name: 'img.heic', type: 'image/heic', size: 10 })
    ).toEqual({ ok: true, kind: 'heic' })
    expect(acceptFile({ name: 'x.HEIF', type: '', size: 1 })).toEqual({
      ok: true,
      kind: 'heic',
    })
  })

  it('classifies PNG and JPG as image', () => {
    expect(acceptFile({ name: 'p.png', type: 'image/png', size: 5 })).toEqual({
      ok: true,
      kind: 'image',
    })
    expect(acceptFile({ name: 'camera', type: 'image/jpeg', size: 5 })).toEqual(
      { ok: true, kind: 'image' }
    )
  })

  it('refuses other types, including a disguised archive', () => {
    expect(
      acceptFile({ name: 'notes.txt', type: 'text/plain', size: 5 })
    ).toEqual({ ok: false, reason: 'type' })
    expect(
      acceptFile({ name: 'archive.pdf.zip', type: 'application/zip', size: 5 })
    ).toEqual({ ok: false, reason: 'type' })
  })

  it('refuses an empty file, but reports type first for an empty .txt', () => {
    expect(
      acceptFile({ name: 'a.pdf', type: 'application/pdf', size: 0 })
    ).toEqual({ ok: false, reason: 'empty' })
    expect(acceptFile({ name: 'a.txt', type: '', size: 0 })).toEqual({
      ok: false,
      reason: 'type',
    })
  })
})
