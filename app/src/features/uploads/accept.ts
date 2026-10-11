export const ACCEPTED_EXT = [
  'pdf',
  'jpg',
  'jpeg',
  'png',
  'heic',
  'heif',
] as const
export type AcceptKind = 'pdf' | 'image' | 'heic'

const ACCEPTED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
]

const extOf = (name: string) => {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

// UPL-02: refuse anything but PDF/JPG/PNG/HEIC before a byte leaves the phone. iOS often sends
// PDFs with an empty `type`, so the extension decides first.
export function acceptFile(f: {
  name: string
  type: string
  size: number
}): { ok: true; kind: AcceptKind } | { ok: false; reason: 'type' | 'empty' } {
  const ext = extOf(f.name)
  const byExt = (ACCEPTED_EXT as readonly string[]).includes(ext)
  if (!byExt && !ACCEPTED_TYPES.includes(f.type))
    return { ok: false, reason: 'type' }
  if (f.size === 0) return { ok: false, reason: 'empty' }
  if (byExt)
    return {
      ok: true,
      kind:
        ext === 'heic' || ext === 'heif'
          ? 'heic'
          : ext === 'pdf'
            ? 'pdf'
            : 'image',
    }
  return {
    ok: true,
    kind: f.type.startsWith('image/hei')
      ? 'heic'
      : f.type === 'application/pdf'
        ? 'pdf'
        : 'image',
  }
}
