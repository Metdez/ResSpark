import heic2any from 'heic2any'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fitWithin, preprocess, sha256Hex } from './preprocess'

vi.mock('heic2any', () => ({
  default: vi.fn(async () => new Blob(['converted'], { type: 'image/jpeg' })),
}))

const file = (name: string, type: string) =>
  new File(['bytes'], name, { type, lastModified: 1 })

// A stub OffscreenCanvas that records its size and the export options.
function stubCanvas() {
  const seen: { w?: number; h?: number; opts?: unknown } = {}
  const out = new Blob(['jpeg'], { type: 'image/jpeg' })
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      constructor(w: number, h: number) {
        seen.w = w
        seen.h = h
      }
      getContext() {
        return { fillStyle: '', fillRect() {}, drawImage() {} }
      }
      async convertToBlob(opts: unknown) {
        seen.opts = opts
        return out
      }
    }
  )
  return { seen, out }
}

const stubBitmap = (width: number, height: number) =>
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width, height, close() {} }))
  )

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('fitWithin', () => {
  it('shrinks the long edge to 2000 px and keeps the ratio', () => {
    expect(fitWithin(4000, 3000)).toEqual({ w: 2000, h: 1500 })
    expect(fitWithin(3000, 6000)).toEqual({ w: 1000, h: 2000 })
  })

  it('never upscales', () => {
    expect(fitWithin(1200, 800)).toEqual({ w: 1200, h: 800 })
    expect(fitWithin(2000, 2000)).toEqual({ w: 2000, h: 2000 })
  })
})

describe('sha256Hex', () => {
  it('hashes the bytes to lower-case hex', async () => {
    expect(await sha256Hex(new Blob(['abc']))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
  })
})

describe('preprocess', () => {
  it('passes a PDF through without touching the canvas', async () => {
    const bitmap = vi.fn()
    vi.stubGlobal('createImageBitmap', bitmap)
    const pdf = file('x.pdf', 'application/pdf')
    expect(await preprocess(pdf, 'pdf')).toEqual({
      blob: pdf,
      mime: 'application/pdf',
      name: 'x.pdf',
    })
    expect(bitmap).not.toHaveBeenCalled()
  })

  it('resizes a large photo to 2000 px and re-encodes JPEG at 0.82', async () => {
    stubBitmap(4000, 3000)
    const { seen, out } = stubCanvas()
    const res = await preprocess(file('IMG_1.png', 'image/png'), 'image')
    expect(seen).toEqual({
      w: 2000,
      h: 1500,
      opts: { type: 'image/jpeg', quality: 0.82 },
    })
    expect(res).toEqual({ blob: out, mime: 'image/jpeg', name: 'IMG_1.jpg' })
  })

  it('falls back to the original photo when the browser cannot decode it', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new Error('decode')
      })
    )
    const jpg = file('scan.jpg', 'image/jpeg')
    expect(await preprocess(jpg, 'image')).toEqual({
      blob: jpg,
      mime: 'image/jpeg',
      name: 'scan.jpg',
    })
    const png = file('scan.png', 'image/png')
    expect((await preprocess(png, 'image')).mime).toBe('image/png')
  })

  it('converts HEIC to JPEG with heic2any, then resizes', async () => {
    stubBitmap(3024, 4032)
    const { seen } = stubCanvas()
    const heic = file('IMG_2.HEIC', 'image/heic')
    const res = await preprocess(heic, 'heic')
    expect(heic2any).toHaveBeenCalledWith({
      blob: heic,
      toType: 'image/jpeg',
      quality: 0.82,
    })
    expect(seen.w).toBe(1500)
    expect(seen.h).toBe(2000)
    expect(res.mime).toBe('image/jpeg')
    expect(res.name).toBe('IMG_2.jpg')
  })

  it('reports heic_failed when the HEIC cannot be converted', async () => {
    vi.mocked(heic2any).mockRejectedValueOnce(new Error('libheif'))
    await expect(
      preprocess(file('a.heic', 'image/heic'), 'heic')
    ).rejects.toThrow('heic_failed')
  })
})
