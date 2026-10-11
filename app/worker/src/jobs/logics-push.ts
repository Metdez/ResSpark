import { getIntegration, readSettings } from '../db/integrations'
import { claimPush, getPushForJob, transitionPush, type PushJob, type PushRow } from '../db/logics-pushes'
import type { LogicsClient } from '../integrations/logics/client'
import { liveClientFromRow } from '../integrations/logics/config'
import { createFakeLogicsClient } from '../integrations/logics/fixtures'
import { logicsWriteGuard } from '../integrations/logics/write-guard'
import type { DocResult, LogicsWriteClient } from '../integrations/logics/write-types'
import { finalizeBatchIfDone } from './logics-push-finalize'
import { ensureNormalized, type NormalizedPart } from './logics-push-normalize'

export type LogicsPushJob = { type: 'logics_push'; provider: 'logics'; ref: string }

// Test seams only: a smaller split target and an injected fake client. Production passes nothing.
export type PushOptions = { targetBytes?: number; clientFactory?: () => LogicsClient }

type Ready = { client: LogicsClient; part: NormalizedPart }
type Refused = { code: string; detail: string; manual?: boolean; noteClient: Pick<LogicsWriteClient, 'createActivity'> }

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

// Every check that must pass before a byte goes to Logics (D-10, C1): in live mode the guard runs
// here as well as in the route; fake mode writes nothing real, so it skips the guard and never reads credentials.
async function prepare(env: Env, job: PushJob, opts: PushOptions): Promise<Ready | Refused> {
  const mode = env.LOGICS_MODE === 'live' ? 'live' : 'fake'
  if (mode === 'live') {
    try {
      logicsWriteGuard(env, String(job.logics_case_id))
    } catch {
      return { code: 'logics_write_blocked', detail: 'Logics writes are blocked for this case', noteClient: refusedNote('logics_write_blocked') }
    }
  }
  if (mode !== job.mode) {
    return { code: 'mode_changed', detail: `Queued in ${job.mode} mode, now ${mode}`, noteClient: refusedNote('mode_changed') }
  }
  const row = await getIntegration(env, job.firm_id, 'logics')
  // D-08 firm toggle, both modes: it can be turned off after the batch was queued (or before a re-send).
  if (!readSettings(row).write_enabled) {
    return {
      code: 'logics_write_blocked',
      detail: 'Logics writes are turned off for this firm in Settings',
      noteClient: refusedNote('logics_write_blocked'),
    }
  }
  let client: LogicsClient
  if (mode === 'fake') {
    client = opts.clientFactory?.() ?? createFakeLogicsClient()
  } else {
    const usable = row && row.api_key_ciphertext && row.secret_ciphertext && row.last_test_ok === true
    const live = usable ? await liveClientFromRow(env, row).catch(() => null) : null
    if (!live) {
      return { code: 'logics_no_credentials', detail: 'No tested Logics credentials', noteClient: refusedNote('logics_no_credentials') }
    }
    client = live
  }
  const result = await ensureNormalized(env, job, opts)
  return result.ok ? { client, part: result.part } : { code: result.code, detail: result.detail, manual: result.manual, noteClient: client }
}

// Claim -> guard -> dispatch -> ack -> transition -> finalize (05-RESEARCH Code Example 4).
// The only retry is a refused claim (nothing was sent). Once createCaseDocument has started, the
// message is acked no matter what; the outcome lives in the ledger (D-03, PUSH-04).
export async function handleLogicsPushPart(msg: Message<LogicsPushJob>, env: Env, opts: PushOptions = {}): Promise<void> {
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
    ready = await prepare(env, job, opts)
  } catch (e) {
    ready = { code: tokenOf(e), detail: 'Could not prepare the file', noteClient: refusedNote(tokenOf(e)) }
  }

  if ('code' in ready) {
    // A pre-dispatch failure after the claim is never retried: staff re-send from the UI (D-03).
    msg.ack()
    await transitionPush(env, {
      pushId: row.id,
      from: 'sending',
      to: 'failed',
      errorCode: ready.code,
      errorDetail: ready.detail,
      needsManual: ready.manual ?? false,
    })
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
  } catch {
    outcome = { kind: 'unknown', code: 'logics_no_response' } // a runtime throw mid-dispatch: it may have reached Logics
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
