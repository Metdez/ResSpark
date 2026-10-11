import { recordConnectionEvent, setConnectionStatus, type ConnectionRow, type ConnectionStatus } from '../db/connections'
import { getSubmission } from '../integrations/esign/docuseal'
import { collectArtifacts, ingestSignedArtifacts } from '../integrations/esign/ingest'
import { ProviderError } from '../integrations/provider-error'
import type { ReconcileOpts } from './reconcile'

const VIEW_EVENTS: Record<string, string> = { 'form.viewed': 'esign.viewed', 'form.started': 'esign.started' }

// D-19: the payload is never trusted; status comes only from GET /submissions/{id}.
export async function reconcileSignature(
  env: Env,
  conn: ConnectionRow,
  opts: ReconcileOpts
): Promise<{ status: ConnectionStatus; applied: boolean }> {
  const unchanged = { status: conn.status, applied: false }
  // D-19: a done signature is final; no DocuSeal call, no new rows.
  if (conn.status === 'done' || conn.status === 'removed' || !conn.external_id) return unchanged

  // D-18: viewed/started are logged only. Setting 'connected' would mark the item submitted unsigned.
  const hint = opts.hint as { event_type?: string; data?: { id?: unknown } } | undefined
  const viewAction = hint?.event_type ? VIEW_EVENTS[hint.event_type] : undefined
  if (viewAction) {
    await recordConnectionEvent(env, conn.id, viewAction, { submitter_id: hint?.data?.id ?? null })
    return unchanged
  }

  const sub = await getSubmission(env, Number(conn.external_id))
  if (sub.status === 'completed') {
    // D-19: download every signed PDF and the audit log in this job; URLs are fetched fresh per attempt.
    const submitterId = typeof conn.data.submitter_id === 'number' ? conn.data.submitter_id : null
    const artifacts = collectArtifacts(sub, submitterId)
    // RESEARCH A6: generation may lag completion; transient so the queue retries within its budget.
    if (!artifacts.length) throw new ProviderError('docuseal', null, 'artifacts_not_ready', true)
    const { created } = await ingestSignedArtifacts(env, conn, sub.id, artifacts)
    const res = await setConnectionStatus(env, conn.id, 'done', { documents: created }, opts.actorId)
    return { status: res.status, applied: res.applied }
  }
  // D-19: declined and expired are errors staff can see; pending and anything else leave the row alone.
  if (sub.status === 'declined' || sub.status === 'expired') {
    const res = await setConnectionStatus(env, conn.id, 'error', { code: sub.status }, opts.actorId)
    return { status: res.status, applied: res.applied }
  }
  return unchanged
}
