import { createHash } from 'node:crypto'
import type { ConnectionRow } from '../db/connections'
import { createAdminClient } from '../db/client'
import { BUCKET, safeName, sniffType } from './case-documents'

type DbEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>

// Two employers with the same name never share a folder: the Truv employer id is part of the group.
export const employerSlug = (companyName: string | null, employerId: string): string => {
  const id = safeName(employerId)
  const company = (companyName ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'employer'
  // the id suffix is never cut: connections-ops matches files to employers by "-<employer_id>"
  return `${company.slice(0, Math.max(1, 59 - id.length))}-${id}`
}

// Built from row ids and sanitized segments only; safeName strips separators, so no '..' traversal.
export function providerObjectPath(p: {
  firm_id: string
  case_id: string
  request_item_id: string
  kind: 'bank' | 'payroll' | 'signature'
  group: string
  name: string
}): string {
  return `firm/${p.firm_id}/case/${p.case_id}/item/${p.request_item_id}/${p.kind}/${safeName(p.group)}/${safeName(p.name)}`
}

async function existing(env: DbEnv, path: string): Promise<string | null> {
  const { data, error } = await createAdminClient(env).from('documents').select('id').eq('storage_key', path).maybeSingle()
  if (error) throw new Error('document_lookup_failed')
  return (data as { id: string } | null)?.id ?? null
}

// Idempotent on storage_key (unique): a rerun or a concurrent writer gets created: false and no second object.
export async function storeProviderFile(
  env: DbEnv,
  p: {
    conn: ConnectionRow
    kind: 'bank' | 'payroll' | 'signature'
    group: string
    name: string
    mime: string
    document_type: string
    // a loader runs only when the path is not stored yet, so a rerun downloads nothing
    bytes: ArrayBuffer | (() => Promise<ArrayBuffer>)
    sha256?: string | null
    actor: string
  }
): Promise<{ document_id: string; created: boolean; storage_key: string }> {
  const { conn } = p
  const path = providerObjectPath({ firm_id: conn.firm_id, case_id: conn.case_id, request_item_id: conn.request_item_id, kind: p.kind, group: p.group, name: p.name })
  const found = await existing(env, path)
  if (found) return { document_id: found, created: false, storage_key: path }
  const bytes = typeof p.bytes === 'function' ? await p.bytes() : p.bytes
  // T-04-14: a vendor file is stored only when its magic bytes match the declared type.
  if (sniffType(new Uint8Array(bytes.slice(0, 16))) !== p.mime) throw new Error('bad_file_type')

  const admin = createAdminClient(env)
  const up = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: p.mime, upsert: false })
  if (up.error && !/exists|duplicate/i.test(up.error.message)) throw new Error('storage_upload_failed')
  const id = crypto.randomUUID()
  const { error } = await admin.from('documents').insert({
    id,
    case_id: conn.case_id,
    request_item_id: conn.request_item_id,
    connection_id: conn.id,
    storage_key: path,
    original_filename: p.name,
    mime_type: p.mime,
    document_type: p.document_type,
    size_bytes: bytes.byteLength,
    sha256: p.sha256 ?? createHash('sha256').update(new Uint8Array(bytes)).digest('hex'),
    status: 'ready',
    uploaded_by_actor: p.actor,
  })
  if (error) {
    const winner = error.code === '23505' ? await existing(env, path) : null
    if (winner) return { document_id: winner, created: false, storage_key: path }
    throw new Error('document_insert_failed')
  }
  return { document_id: id, created: true, storage_key: path }
}
