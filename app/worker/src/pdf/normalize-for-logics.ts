import { imageToPdf, sniffImage } from './image-to-pdf'
import { splitPdf } from './split-pdf'

export type NormalizeErrorCode =
  | 'pdf_page_too_large'
  | 'pdf_encrypted'
  | 'pdf_unparseable'
  | 'image_unsupported_format'
  | 'source_too_large'

export type NormalizeResult =
  | {
      ok: true
      parts: Array<{ fileName: string; bytes: Uint8Array; sha256: string }>
    }
  | { ok: false; code: NormalizeErrorCode; page?: number }

// 40 MiB input cap (RESEARCH A7): keeps one parse well inside the 128 MB isolate.
export const DEFAULT_MAX_SOURCE_BYTES = 41_943_040

const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d] // %PDF-

export function partFileName(name: string, k: number, n: number): string {
  const base = name.replace(/\.(pdf|jpe?g|png)$/i, '')
  return n === 1 ? `${base}.pdf` : `${base} (part ${k} of ${n}).pdf`
}

async function sha256hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0')
  ).join('')
}

export async function normalizeForLogics(
  input: { bytes: Uint8Array; mime: string; name: string },
  opts: { targetBytes: number; maxSourceBytes?: number }
): Promise<NormalizeResult> {
  const { bytes, name } = input
  if (bytes.byteLength > (opts.maxSourceBytes ?? DEFAULT_MAX_SOURCE_BYTES)) {
    return { ok: false, code: 'source_too_large' }
  }

  // input.mime is never trusted; the bytes decide.
  const kind = sniffImage(bytes)
  if (kind === 'heic') return { ok: false, code: 'image_unsupported_format' }
  let pdf = bytes
  if (kind) {
    try {
      pdf = await imageToPdf([{ bytes, kind }])
    } catch {
      return { ok: false, code: 'pdf_unparseable' }
    }
  } else if (!PDF_HEADER.every((byte, i) => bytes[i] === byte)) {
    return { ok: false, code: 'pdf_unparseable' }
  }

  const split = await splitPdf(pdf, opts.targetBytes)
  if ('error' in split) {
    return 'page' in split
      ? { ok: false, code: split.error, page: split.page }
      : { ok: false, code: split.error }
  }

  const n = split.parts.length
  const parts = await Promise.all(
    split.parts.map(async (part, i) => ({
      // An unsplit PDF keeps its exact name; images and split parts are renamed.
      fileName: !kind && n === 1 ? name : partFileName(name, i + 1, n),
      bytes: part,
      sha256: await sha256hex(part),
    }))
  )
  if (parts.some((p) => p.bytes.byteLength > opts.targetBytes)) {
    throw new Error('normalize_invariant')
  }
  return { ok: true, parts }
}
