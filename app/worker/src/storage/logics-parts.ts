import { createAdminClient } from '../db/client'
import { BUCKET } from './case-documents'

type DbEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>

// D-06: Worker-written parts live beside the document, under the same private bucket.
export function partPath(p: { firm_id: string; case_id: string; document_id: string; part_index: number }): string {
  return `firm/${p.firm_id}/case/${p.case_id}/logics/${p.document_id}/part-${p.part_index}.pdf`
}

// upsert: a re-run after an interrupted upload overwrites the same deterministic bytes.
export async function uploadPart(env: DbEnv, path: string, bytes: Uint8Array): Promise<void> {
  const { error } = await createAdminClient(env)
    .storage.from(BUCKET)
    .upload(path, bytes, { contentType: 'application/pdf', upsert: true })
  if (error) throw new Error('storage_write_failed')
}

export async function downloadPart(env: DbEnv, path: string): Promise<Uint8Array> {
  const { data, error } = await createAdminClient(env).storage.from(BUCKET).download(path)
  if (error || !data) throw new Error('storage_read_failed')
  return new Uint8Array(await data.arrayBuffer())
}
