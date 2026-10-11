// Mirrors LOGICS_MAX_PART_BYTES in worker/src/integrations/logics/write-types.ts (5.5 MiB, under Logics' 6 MB cap).
export const LOGICS_PART_LIMIT_BYTES = 5_767_168
export const LOGICS_MAX_SOURCE_BYTES = 41_943_040

export type PushPlan =
  | { kind: 'single' }
  | { kind: 'split'; estimatedParts: number }
  | { kind: 'image_to_pdf' }
  | { kind: 'manual'; reason: string }

// One approved, ready document as the card and the sheet see it.
export interface PushableDoc {
  id: string
  name: string
  size_bytes: number | null
  plan: PushPlan
}

const manual =(reason: string): PushPlan => ({ kind: 'manual', reason })

// An estimate of what the consumer will do (D-05); the consumer's result in the ledger is the truth.
export function pushPlan(doc: { mime: string; size_bytes: number | null; name: string }): PushPlan {
  const size = doc.size_bytes
  if (!size) return manual('File not finished uploading')
  if (/^image\/hei[cf]$/i.test(doc.mime) || /\.hei[cf]$/i.test(doc.name)) {
    return manual('Ask the client to re-upload as JPG or PDF.')
  }
  if (size > LOGICS_MAX_SOURCE_BYTES) return manual('over 40 MB')
  const image = doc.mime === 'image/jpeg' || doc.mime === 'image/png'
  if (doc.mime !== 'application/pdf' && !image) return manual('Unsupported file type')
  if (size > LOGICS_PART_LIMIT_BYTES) {
    return { kind: 'split', estimatedParts: Math.ceil(size / LOGICS_PART_LIMIT_BYTES) }
  }
  return image ? { kind: 'image_to_pdf' } : { kind: 'single' }
}

export function planLabel(p: PushPlan): string {
  switch (p.kind) {
    case 'single':
      return 'Sends as 1 file'
    case 'split':
      return `Will split into about ${p.estimatedParts} parts`
    case 'image_to_pdf':
      return 'Converted to PDF'
    case 'manual':
      return `Needs manual compression — ${p.reason}`
  }
}

// Same rule as review/document-row's private formatSize (not exported there).
export function sizeLabel(bytes: number | null): string {
  if (bytes === null) return '—'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
