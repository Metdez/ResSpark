export type Transport = 'tus' | 'put'

// 01-SPIKES.md § Spike (c): "Result: PASS (simple path `uploadToSignedUrl`) / PASS (resumable TUS
// via `/storage/v1/upload/resumable/sign`)" on https://<ref>.storage.supabase.co. Resumable wins (D-01).
export const UPLOAD_TRANSPORT: Transport = 'tus'

export interface UploadTarget {
  document_id: string
  path: string
  token: string
  signed_url: string
}

export class UploadError extends Error {
  constructor(
    public code: 'upload_failed' | 'network' | 'aborted',
    public status = 0
  ) {
    super(code)
    this.name = 'UploadError'
  }
}

type Options = { transport?: Transport; signal?: AbortSignal }

const publishableKey = () =>
  String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '')

// The spike's endpoint lives on the dedicated storage host: <ref>.supabase.co → <ref>.storage.supabase.co.
export function tusEndpoint(): string {
  const url = new URL(String(import.meta.env.VITE_SUPABASE_URL ?? ''))
  const host = url.host.endsWith('.supabase.co')
    ? url.host.replace(/\.supabase\.co$/, '.storage.supabase.co')
    : url.host
  return `${url.protocol}//${host}/storage/v1/upload/resumable/sign`
}

export async function uploadBlob(
  target: UploadTarget,
  blob: Blob,
  mime: string,
  onProgress: (fraction: number) => void,
  { transport = UPLOAD_TRANSPORT, signal }: Options = {}
): Promise<void> {
  if (signal?.aborted) throw new UploadError('aborted')
  return transport === 'tus'
    ? viaTus(target, blob, mime, onProgress, signal)
    : viaPut(target, blob, mime, onProgress, signal)
}

// ---- signed PUT: three attempts, retry-from-zero ------------------------------------------------

// Attempt 1 is immediate; attempts 2 and 3 wait 1 s and 3 s. 5 s is reserved for a fourth attempt.
const PUT_DELAYS = [1000, 3000, 5000]
const PUT_ATTEMPTS = 3

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// XMLHttpRequest, not fetch: fetch has no upload progress. Resolves the HTTP status; 0 = network error.
function putOnce(
  url: string,
  blob: Blob,
  mime: string,
  onProgress: (f: number) => void,
  signal?: AbortSignal
): Promise<number> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('content-type', mime)
    xhr.setRequestHeader('apikey', publishableKey())
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.upload.onprogress = (e) => {
      if (e.total > 0) onProgress(e.loaded / e.total)
    }
    xhr.onload = () => resolve(xhr.status)
    xhr.onerror = () => resolve(0)
    xhr.onabort = () => reject(new UploadError('aborted'))
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(blob)
  })
}

async function viaPut(
  target: UploadTarget,
  blob: Blob,
  mime: string,
  onProgress: (f: number) => void,
  signal?: AbortSignal
) {
  for (let attempt = 1; ; attempt++) {
    const status = await putOnce(
      target.signed_url,
      blob,
      mime,
      onProgress,
      signal
    )
    if (status >= 200 && status < 300) return
    if (status >= 400 && status < 500)
      throw new UploadError('upload_failed', status)
    if (attempt >= PUT_ATTEMPTS) throw new UploadError('network', status)
    await sleep(PUT_DELAYS[attempt - 1])
    if (signal?.aborted) throw new UploadError('aborted')
  }
}

// ---- TUS resumable (6 MiB chunks, x-signature) --------------------------------------------------

async function viaTus(
  target: UploadTarget,
  blob: Blob,
  mime: string,
  onProgress: (f: number) => void,
  signal?: AbortSignal
) {
  const tus = await import('tus-js-client')
  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(blob, {
      endpoint: tusEndpoint(),
      headers: { apikey: publishableKey(), 'x-signature': target.token },
      // Supabase requires every chunk but the last to be exactly 6 MiB (spike (c)).
      chunkSize: 6 * 1024 * 1024,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      metadata: {
        bucketName: 'case-documents',
        objectName: target.path,
        contentType: mime,
        cacheControl: '3600',
      },
      // A processed Blob has no name or lastModified, so key resume on the document instead.
      // shortcut: resuming assumes re-encoding the same photo gives the same bytes on the same
      // browser; when it does not, tus errors and the sheet starts that file over.
      fingerprint: async () => `rs-${target.document_id}`,
      onProgress: (sent, total) => onProgress(total > 0 ? sent / total : 0),
      onError: (err) => {
        const status =
          (
            err as { originalResponse?: { getStatus(): number } | null }
          ).originalResponse?.getStatus() ?? 0
        reject(
          new UploadError(
            status >= 400 && status < 500 ? 'upload_failed' : 'network',
            status
          )
        )
      },
      onSuccess: () => resolve(),
    })
    signal?.addEventListener(
      'abort',
      () => {
        void upload.abort()
        reject(new UploadError('aborted'))
      },
      { once: true }
    )
    upload.findPreviousUploads().then((previous) => {
      if (previous[0]) upload.resumeFromPreviousUpload(previous[0])
      upload.start()
    }, reject)
  })
}

// ---- pending uploads: { itemId: { fileKey: document_id } } in localStorage ----------------------

const PENDING = 'rs_pending_uploads'
type PendingMap = Record<string, Record<string, string>>

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

// Private mode, a full quota or corrupt JSON all read as "nothing pending".
function readAll(): PendingMap {
  try {
    const all: unknown = JSON.parse(localStorage.getItem(PENDING) ?? '{}')
    return isObject(all) ? (all as PendingMap) : {}
  } catch {
    return {}
  }
}

function writeAll(all: PendingMap) {
  try {
    localStorage.setItem(PENDING, JSON.stringify(all))
  } catch {
    // no storage: an interrupted upload simply starts over
  }
}

export const pendingKey = (f: {
  name: string
  size: number
  lastModified: number
}) => `${f.name}|${f.size}|${f.lastModified}`

export function readPending(itemId: string): Record<string, string> {
  const entry = readAll()[itemId]
  if (!isObject(entry)) return {}
  return Object.fromEntries(
    Object.entries(entry).filter(
      (e): e is [string, string] => typeof e[1] === 'string'
    )
  )
}

export function writePending(
  itemId: string,
  fileKey: string,
  documentId: string
) {
  const all = readAll()
  writeAll({
    ...all,
    [itemId]: { ...readPending(itemId), [fileKey]: documentId },
  })
}

export function clearPending(itemId: string, fileKey: string) {
  const all = readAll()
  const rest = readPending(itemId)
  delete rest[fileKey]
  writeAll({ ...all, [itemId]: rest })
}
