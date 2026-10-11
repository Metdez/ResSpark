import type { ConnectionRow } from '../../db/connections'
import { safeName } from '../../storage/case-documents'
import { storeProviderFile } from '../../storage/connection-files'
import { isTransientStatus, ProviderError } from '../provider-error'
import type { DsSubmission } from './docuseal'

export interface SignedArtifact {
  document_type: 'signed_document' | 'esign_audit_log'
  name: string
  url: string
}

// Every signed document plus the audit trail, or [] while DocuSeal is still generating them (RESEARCH A6).
// URLs expire after 40 minutes, so they live only inside the job that re-read the submission (A5).
export function collectArtifacts(sub: DsSubmission, submitterId: number | null): SignedArtifact[] {
  const own = sub.submitters.find((s) => s.id === submitterId)?.documents ?? []
  const docs = sub.documents?.length ? sub.documents : own
  if (!docs.length || !sub.audit_log_url) return []
  return [
    ...docs.map((d, i): SignedArtifact => ({
      document_type: 'signed_document',
      name: `signed-${i + 1}-${safeName(d.name.replace(/\.pdf$/i, ''))}.pdf`,
      url: d.url,
    })),
    { document_type: 'esign_audit_log', name: 'audit-log.pdf', url: sub.audit_log_url },
  ]
}

// No X-Auth-Token: document URLs are pre-signed and may sit on another host (T-06-17).
// 404 is transient: the retry re-reads the submission and gets fresh URLs.
export async function downloadArtifact(url: string): Promise<ArrayBuffer> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new ProviderError('docuseal', null, 'bad_url', false)
  }
  if (parsed.protocol !== 'https:') throw new ProviderError('docuseal', null, 'bad_url', false)
  let res: Response
  try {
    res = await fetch(parsed.href)
  } catch {
    throw new ProviderError('docuseal', null, 'network', true)
  }
  if (!res.ok) throw new ProviderError('docuseal', res.status, 'file_download_failed', res.status === 404 || isTransientStatus(res.status))
  return res.arrayBuffer()
}

// Deterministic paths (signature/{submission_id}/{name}) make a rerun a no-op that downloads nothing.
export async function ingestSignedArtifacts(
  env: Env,
  conn: ConnectionRow,
  submissionId: number,
  artifacts: SignedArtifact[]
): Promise<{ created: number; document_ids: string[] }> {
  let created = 0
  const document_ids: string[] = []
  for (const a of artifacts) {
    const res = await storeProviderFile(env, {
      conn,
      kind: 'signature',
      group: String(submissionId),
      name: a.name,
      mime: 'application/pdf',
      document_type: a.document_type,
      bytes: () => downloadArtifact(a.url),
      actor: 'provider:docuseal',
    })
    if (res.created) created += 1
    document_ids.push(res.document_id)
  }
  return { created, document_ids }
}
