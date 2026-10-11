import { addParts, fingerprintHex, type PushJob } from '../db/logics-pushes'
import { LOGICS_MAX_PART_BYTES } from '../integrations/logics/write-types'
import { normalizeForLogics, type NormalizeErrorCode, type NormalizeResult } from '../pdf/normalize-for-logics'
import { downloadPart, partPath, uploadPart } from '../storage/logics-parts'
import type { LogicsPushJob } from './logics-push'

export interface NormalizedPart {
  fileName: string
  bytes: Uint8Array
  sha256: string
  partIndex: number
  partCount: number
}

export type EnsureResult = { ok: true; part: NormalizedPart } | { ok: false; code: string; detail: string; manual: boolean }

// Staff copy for files ResSpark cannot shrink (Plan 02 companion doc); shown as is by the push UI.
export const MANUAL_COPY: Record<NormalizeErrorCode, string> = {
  pdf_page_too_large: 'One page is too large to send. Compress it outside ResSpark and re-upload.',
  pdf_encrypted: 'This PDF is password-protected. Ask for an unlocked copy.',
  pdf_unparseable: 'This file could not be read as a PDF.',
  image_unsupported_format: 'Ask the client to re-upload as JPG or PDF.',
  source_too_large: 'This file is over 40 MB. Compress it outside ResSpark and re-upload.',
}

const READ_FAILED = { ok: false, code: 'storage_read_failed', detail: 'ResSpark could not read the file in storage. Re-send to try again.', manual: false } as const
const WRITE_FAILED = { ok: false, code: 'storage_write_failed', detail: 'ResSpark could not write the file in storage. Re-send to try again.', manual: false } as const

async function sha256hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function read(env: Env, path: string): Promise<Uint8Array | null> {
  try {
    return await downloadPart(env, path)
  } catch {
    return null
  }
}

// D-05/D-06: part 0 normalizes the source once, stores every part with its hash and mints the
// sibling rows; every later send (a sibling, a staff re-send) reads its stored bytes, so the same
// part always goes out byte-identical. Deterministic, so an interrupted run can simply re-run.
export async function ensureNormalized(env: Env, job: PushJob, opts: { targetBytes?: number } = {}): Promise<EnsureResult> {
  if (job.part_storage_path !== null) {
    const bytes = await read(env, job.part_storage_path)
    if (!bytes) return READ_FAILED
    if (job.part_sha256 === null || (await sha256hex(bytes)) !== job.part_sha256) {
      return { ok: false, code: 'part_hash_mismatch', detail: 'The stored part does not match its recorded hash', manual: false }
    }
    return {
      ok: true,
      part: { fileName: job.file_name, bytes, sha256: job.part_sha256, partIndex: job.part_index, partCount: job.part_count ?? 1 },
    }
  }

  let result: NormalizeResult
  {
    // C14: the source lives only in this block; from here on only the parts stay referenced.
    const source = await read(env, job.storage_key)
    if (!source) return READ_FAILED
    if ((await sha256hex(source)) !== job.source_sha256) {
      return { ok: false, code: 'source_hash_mismatch', detail: 'The stored file does not match its upload hash', manual: false }
    }
    result = await normalizeForLogics(
      { bytes: source, mime: job.source_mime, name: job.file_name },
      { targetBytes: opts.targetBytes ?? LOGICS_MAX_PART_BYTES }
    )
  }
  if (!result.ok) return { ok: false, code: result.code, detail: MANUAL_COPY[result.code], manual: true }

  const n = result.parts.length
  const parts = []
  for (const [k, p] of result.parts.entries()) {
    const storagePath = partPath({ ...job, part_index: k })
    try {
      await uploadPart(env, storagePath, p.bytes)
    } catch {
      return WRITE_FAILED
    }
    const fingerprint = await fingerprintHex(job.case_id, job.source_sha256!, k)
    parts.push({ partIndex: k, fingerprint, fileName: p.fileName, storagePath, bytes: p.bytes.byteLength, sha256: p.sha256 })
  }
  // Fingerprints already present are skipped in SQL, so a re-run mints no duplicate siblings.
  const siblings = await addParts(env, { pushId: job.id, partCount: n, parts })
  for (const ref of siblings) {
    // shortcut: a failed send leaves the sibling queued; the cron sweeper re-enqueues it after 5 minutes.
    await env.JOBS.send({ type: 'logics_push', provider: 'logics', ref } satisfies LogicsPushJob).catch(() => {})
  }
  const first = result.parts[0]
  return { ok: true, part: { fileName: first.fileName, bytes: first.bytes, sha256: first.sha256, partIndex: 0, partCount: n } }
}
