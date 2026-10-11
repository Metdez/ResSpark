import { PDFDocument } from '@cantoo/pdf-lib'

export type SplitResult =
  | { parts: Uint8Array[] }
  | { error: 'pdf_page_too_large'; page: number }
  | { error: 'pdf_encrypted' | 'pdf_unparseable' }

export async function splitPdf(
  bytes: Uint8Array,
  targetBytes: number
): Promise<SplitResult> {
  // Under the gate: send the original bytes; a re-save could only change them.
  if (bytes.byteLength <= targetBytes) return { parts: [bytes] }

  let src: PDFDocument
  try {
    src = await PDFDocument.load(bytes, { ignoreEncryption: true })
  } catch {
    return { error: 'pdf_unparseable' }
  }
  if (src.isEncrypted) {
    try {
      src = await PDFDocument.load(bytes, { password: '' })
    } catch {
      return { error: 'pdf_encrypted' }
    }
  }
  // An over-gate file with no pages would otherwise "send" zero parts.
  if (src.getPageCount() === 0) return { error: 'pdf_unparseable' }

  // shortcut: one save() per page (O(pages x part size)); switch to a byte-ratio
  // estimate with a final verification save if a real upload takes over 20 s.
  const parts: Uint8Array[] = []
  let part = await PDFDocument.create()
  let lastGood: Uint8Array | null = null
  for (let i = 0; i < src.getPageCount(); i++) {
    const [page] = await part.copyPages(src, [i])
    part.addPage(page)
    let saved = await part.save({ objectsPerTick: Infinity })
    if (saved.byteLength <= targetBytes) {
      lastGood = saved
      continue
    }
    if (!lastGood) return { error: 'pdf_page_too_large', page: i + 1 }

    parts.push(lastGood)
    part = await PDFDocument.create()
    const [restart] = await part.copyPages(src, [i])
    part.addPage(restart)
    saved = await part.save({ objectsPerTick: Infinity })
    if (saved.byteLength > targetBytes) {
      return { error: 'pdf_page_too_large', page: i + 1 }
    }
    lastGood = saved
  }
  if (lastGood) parts.push(lastGood)

  if (parts.some((p) => p.byteLength > targetBytes)) {
    throw new Error('split_invariant')
  }
  return { parts }
}
