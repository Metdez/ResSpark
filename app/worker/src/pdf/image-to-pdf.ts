import { PDFDocument } from '@cantoo/pdf-lib'

export type ImageKind = 'jpeg' | 'png' | 'heic'

const HEIF_BOXES = ['ftypheic', 'ftypheix', 'ftypmif1']

const startsWith = (bytes: Uint8Array, signature: number[]) =>
  signature.every((byte, i) => bytes[i] === byte)

export function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg'
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return 'png'
  // ISO-BMFF: 4-byte box size, then 'ftyp' and the major brand at offset 4.
  const box = String.fromCharCode(...bytes.subarray(4, 12))
  if (HEIF_BOXES.includes(box)) return 'heic'
  return null
}

export async function imageToPdf(
  images: Array<{ bytes: Uint8Array; kind: 'jpeg' | 'png' }>
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (const { bytes, kind } of images) {
    const img =
      kind === 'jpeg' ? await doc.embedJpg(bytes) : await doc.embedPng(bytes)
    doc.addPage([img.width, img.height]).drawImage(img, {
      x: 0,
      y: 0,
      width: img.width,
      height: img.height,
    })
  }
  return doc.save({ objectsPerTick: Infinity })
}
