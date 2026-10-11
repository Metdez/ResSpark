import { createAdminClient } from '../db/client'
import { getIntegration } from '../db/integrations'
import { claimPush, getPushForJob, transitionPush, type PushJob, type PushRow } from '../db/logics-pushes'
import type { LogicsClient } from '../integrations/logics/client'
import { liveClientFromRow } from '../integrations/logics/config'
import { createFakeLogicsClient } from '../integrations/logics/fixtures'
import { logicsWriteGuard } from '../integrations/logics/write-guard'
import { LOGICS_MAX_PART_BYTES, type DocResult, type LogicsWriteClient } from '../integrations/logics/write-types'
import { BUCKET } from '../storage/case-documents'
import { finalizeBatchIfDone } from './logics-push-finalize'

export type LogicsPushJob = { type: 'logics_push'; provider: 'logics'; ref: string }

type Part = { fileName: string; bytes: Uint8Array }
type Ready = { client: LogicsClient; part: Part }
type Refused = { code: string; detail: string; noteClient: Pick<LogicsWriteClient, 'createActivity'> }

// D-07 wording verbatim.
export function buildDocumentComment(job: Pick<PushJob, 'agent_display_name' | 'file_name' | 'part_index' | 'part_count'>): string {
  const part = job.part_count !== null && job.part_count > 1 ? ` (part ${job.part_index + 1} of ${job.part_count})` : ''
  return `Uploaded via ResSpark by ${job.agent_display_name} — ${job.file_name}${part}`
}

// A batch whose note cannot be written (guard, mode, credentials) still finalizes; the refusal is
// recorded on the batch instead of a POST.
const refusedNote = (code: string): Pick<LogicsWriteClient, 'createActivity'> => ({
  createActivity: async () => ({ kind: 'failed', status: 0, code }),
})

const tokenOf = (e: unknown) => (e instanceof Error && /^[a-z_]+$/.test(e.message) ? e.message : 'internal')

async function sha256hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// shortcut: pass-through only (a stored PDF under the gate, no stored parts); everything else is
// failed `normalization_pending` until Plan 03 swaps this for normalizeForLogics.
async function ensureNormalized(env: Env, job: PushJob): Promise<Part | { code: string; detail: string }> {
  if (
    job.part_storage_path !== null ||
    job.source_mime !== 'application/pdf' ||
    job.source_bytes === null ||
    job.source_bytes > LOGICS_MAX_PART_BYTES
  ) {
    return { code: 'normalization_pending', detail: 'This file needs splitting or conversion before it can be sent' }
  }
  const { data, error } = await createAdminClient(env).storage.from(BUCKET).download(job.storage_key)
  if (error || !data) return { code: 'source_read_failed', detail: 'The stored file could not be read' }
  const bytes = new Uint8Array(await data.arrayBuffer())
  if ((await sha256hex(bytes)) !== job.source_sha256) {
    return { code: 'source_hash_mismatch', detail: 'The stored file does not match its upload hash' }
  }
  return { fileName: job.file_name, bytes }
}

// Every check that must pass before a byte goes to Logics (D-10, C1): the guard runs here as well
// as in the route, in both modes; fake mode never reads credentials.
async function prepare(env: Env, job: PushJob): Promise<Ready | Refused> {
  try {
    logicsWriteGuard(env, String(job.logics_case_id))
  } catch {
    return { code: 'logics_write_blocked', detail: 'Logics writes are blocked for this case', noteClient: refusedNote('logics_write_blocked') }
  }
  const mode = env.LOGICS_MODE === 'live' ? 'live' : 'fake'
  if (mode !== job.mode) {
    return { code: 'mode_changed', detail: `Queued in ${job.mode} mode, now ${mode}`, noteClient: refusedNote('mode_changed') }
  }
  let client: LogicsClient
  if (mode === 'fake') {
    client = createFakeLogicsClient()
  } else {
    const row = await getIntegration(env, job.firm_id, 'logics')
    const usable = row && row.api_key_ciphertext && row.secret_ciphertext && row.last_test_ok === true
    const live = usable ? await liveClientFromRow(env, row).catch(() => null) : null
    if (!live) {
      return { code: 'logics_no_credentials', detail: 'No tested Logics credentials', noteClient: refusedNote('logics_no_credentials') }
    }
    client = live
  }
  const part = await ensureNormalized(env, job)
  return 'code' in part ? { ...part, noteClient: client } : { client, part }
}

// Claim -> guard -> dispatch -> ack -> transition -> finalize (05-RESEARCH Code Example 4).
// The only retry is a refused claim (nothing was sent). Once createCaseDocument has started, the
// message is acked no matter what; the outcome lives in the ledger (D-03, PUSH-04).
export async function handleLogicsPushPart(msg: Message<LogicsPushJob>, env: Env): Promise<void> {
  let row: PushRow | null = null
  let retry = false
  try {
    row = await claimPush(env, msg.body.ref)
    // Refused: a sibling of the case is sending (retry) or the row is gone/terminal (redelivery, ack).
    if (!row) retry = (await getPushForJob(env, msg.body.ref))?.state === 'queued'
  } catch {
    retry = true // the claim itself failed; nothing was sent
  }
  if (!row) {
    if (retry) msg.retry({ delaySeconds: 30 })
    else msg.ack()
    return
  }

  let job: PushJob | null = null
  let ready: Ready | Refused
  try {
    job = await getPushForJob(env, row.id)
    if (!job) throw new Error('push_missing')
    ready = await prepare(env, job)
  } catch (e) {
    ready = { code: tokenOf(e), detail: 'Could not prepare the file', noteClient: refusedNote(tokenOf(e)) }
  }

  if ('code' in ready) {
    await transitionPush(env, { pushId: row.id, from: 'sending', to: 'failed', errorCode: ready.code, errorDetail: ready.detail })
    msg.ack()
    await finalizeBatchIfDone(env, row.batch_id, ready.noteClient)
    return
  }

  const { client, part } = ready
  const target = job!
  let outcome: DocResult
  try {
    outcome = await client.createCaseDocument({
      caseId: target.logics_case_id,
      comment: buildDocumentComment(target),
      fileCategoryId: target.file_category_id ?? undefined,
      fileName: part.fileName,
      bytes: part.bytes,
    })
  } finally {
    msg.ack()
  }

  if (outcome.kind === 'sent') {
    await transitionPush(env, { pushId: row.id, from: 'sending', to: 'sent', logicsDocumentId: outcome.logicsDocumentId })
  } else {
    const detail = outcome.kind === 'failed' && outcome.status > 0 ? `Logics returned HTTP ${outcome.status}` : null
    await transitionPush(env, { pushId: row.id, from: 'sending', to: outcome.kind, errorCode: outcome.code, errorDetail: detail })
  }
  await finalizeBatchIfDone(env, row.batch_id, client)
}
