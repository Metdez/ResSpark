import { createAdminClient } from '../db/client'

type DbEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>

export const BUCKET = 'case-documents'
export const ACCEPTED_MIMES = ['application/pdf', 'image/jpeg', 'image/png'] as const
export type AcceptedMime = (typeof ACCEPTED_MIMES)[number]
export const MAX_BYTES = 26_214_400 // 25 MiB (D-02), same as the bucket's file_size_limit
export const MAX_FILES_PER_ITEM = 10 // D-02

export function safeName(name: string): string {
  const base = name.normalize('NFC').split(/[/\\]/).pop() ?? ''
  const cleaned = base
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 80)
  return cleaned || 'file'
}

// D-01: built from session ids only; the client controls nothing but the sanitized file name.
export function objectPath(p: {
  firm_id: string
  case_id: string
  request_item_id: string
  document_id: string
  name: string
}): string {
  return `firm/${p.firm_id}/case/${p.case_id}/item/${p.request_item_id}/${p.document_id}/${safeName(p.name)}`
}

const startsWith = (bytes: Uint8Array, sig: number[]) =>
  bytes.length >= sig.length && sig.every((b, i) => bytes[i] === b)

// D-03 magic bytes.
export function sniffType(bytes: Uint8Array): AcceptedMime | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf' // %PDF-
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return 'image/png'
  return null
}

export async function signedUploadToken(
  env: DbEnv,
  path: string
): Promise<{ token: string; path: string; signedUrl: string }> {
  const { data, error } = await createAdminClient(env).storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data) throw new Error('storage_sign_failed')
  return { token: data.token, path: data.path, signedUrl: data.signedUrl }
}

// Reads at most the first n bytes of a stored object; null when the object does not exist.
export async function headBytes(
  env: DbEnv,
  path: string,
  n = 16
): Promise<{ bytes: Uint8Array; size: number | null } | null> {
  const { data, error } = await createAdminClient(env).storage.from(BUCKET).createSignedUrl(path, 60)
  if (error || !data) {
    if (/not.?found/i.test(error?.message ?? '')) return null
    throw new Error('storage_sign_failed')
  }
  const res = await fetch(data.signedUrl, { headers: { range: 'bytes=0-15' } })
  if (res.status === 404 || res.status === 400) {
    await res.body?.cancel()
    return null
  }
  // an empty object cannot satisfy bytes=0-15; it then fails the magic-byte check like any other bad file
  if (res.status === 416) {
    await res.body?.cancel()
    return { bytes: new Uint8Array(), size: 0 }
  }
  // Storage honours Range (206 confirmed live in worker/test/uploads.test.ts); anything else fails closed.
  if (res.status !== 206) {
    await res.body?.cancel()
    throw new Error('storage_read_failed')
  }
  const total = Number((res.headers.get('content-range') ?? '').split('/')[1])
  return { bytes: new Uint8Array(await res.arrayBuffer()).slice(0, n), size: Number.isFinite(total) ? total : null }
}

export async function signedReadUrl(
  env: DbEnv,
  path: string,
  opts: { download?: string | false; expiresIn?: number }
): Promise<string> {
  const { data, error } = await createAdminClient(env)
    .storage.from(BUCKET)
    .createSignedUrl(path, opts.expiresIn ?? 300, opts.download ? { download: opts.download } : undefined)
  if (error || !data) throw new Error('storage_sign_failed')
  return data.signedUrl
}

export async function removeObject(env: DbEnv, path: string): Promise<void> {
  const { error } = await createAdminClient(env).storage.from(BUCKET).remove([path])
  if (error) throw new Error('storage_remove_failed')
}
