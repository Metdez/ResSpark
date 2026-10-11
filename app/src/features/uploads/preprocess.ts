import type { AcceptKind } from './accept'

export const MAX_EDGE = 2000
export const JPEG_QUALITY = 0.82

export type UploadMime = 'application/pdf' | 'image/jpeg' | 'image/png'
export interface Processed {
  blob: Blob
  mime: UploadMime
  name: string
}

// Integer math so 3000×6000 lands on exactly 1000×2000. Never upscales.
export function fitWithin(w: number, h: number, maxEdge = MAX_EDGE) {
  const long = Math.max(w, h)
  if (long <= maxEdge) return { w, h }
  return {
    w: Math.floor((w * maxEdge) / long),
    h: Math.floor((h * maxEdge) / long),
  }
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

const jpgName = (name: string) => name.replace(/\.[^.]*$/, '') + '.jpg'

type Ctx2d = {
  fillStyle: string | CanvasGradient | CanvasPattern
  fillRect(x: number, y: number, w: number, h: number): void
  drawImage(img: ImageBitmap, x: number, y: number, w: number, h: number): void
}

function draw(ctx: Ctx2d | null, bitmap: ImageBitmap, w: number, h: number) {
  if (!ctx) throw new Error('no_canvas')
  // white under transparent PNG pixels; JPEG has no alpha and would turn them black
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bitmap, 0, 0, w, h)
}

async function toJpeg(source: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(source)
  try {
    const { w, h } = fitWithin(bitmap.width, bitmap.height)
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(w, h)
      draw(canvas.getContext('2d'), bitmap, w, h)
      return await canvas.convertToBlob({
        type: 'image/jpeg',
        quality: JPEG_QUALITY,
      })
    }
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    draw(canvas.getContext('2d'), bitmap, w, h)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('no_blob'))),
        'image/jpeg',
        JPEG_QUALITY
      )
    )
  } finally {
    bitmap.close()
  }
}

// D-02: PDFs pass through; photos shrink to 2,000 px and re-encode as JPEG 0.82 on a canvas;
// HEIC is converted first by heic2any, loaded only when a HEIC file is picked.
export async function preprocess(
  file: File,
  kind: AcceptKind
): Promise<Processed> {
  if (kind === 'pdf')
    return { blob: file, mime: 'application/pdf', name: file.name }

  let source: Blob = file
  if (kind === 'heic') {
    try {
      const { default: heic2any } = await import('heic2any')
      const out = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: JPEG_QUALITY,
      })
      source = Array.isArray(out) ? out[0] : out
    } catch {
      // the server cannot take HEIC bytes, so a failed conversion must not be uploaded as-is
      throw new Error('heic_failed')
    }
  }

  try {
    return {
      blob: await toJpeg(source),
      mime: 'image/jpeg',
      name: jpgName(file.name),
    }
  } catch {
    // shortcut: a photo the browser cannot decode is sent unchanged (the server still sniffs the
    // bytes and caps the size); upgrade to telling the user if this ever shows up in support.
    if (kind === 'heic')
      return { blob: source, mime: 'image/jpeg', name: jpgName(file.name) }
    const png = file.type === 'image/png' || /\.png$/i.test(file.name)
    return {
      blob: file,
      mime: png ? 'image/png' : 'image/jpeg',
      name: file.name,
    }
  }
}
