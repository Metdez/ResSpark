import { finalizeBatch, recordBatchActivity, type FinalizePart } from '../db/logics-pushes'
import type { LogicsWriteClient } from '../integrations/logics/write-types'

type DbEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>

const MAX_COMMENT = 4_000

const label = (p: FinalizePart) =>
  p.file_name +
  (p.part_count !== null && p.part_count > 1 ? ` (part ${p.part_index + 1} of ${p.part_count})` : '') +
  ` rs:${p.document_id.slice(0, 8)}`

// D-07 / Andrew's wording; rs:<8 hex> lets staff match a Logics row back to the ResSpark document.
export function buildActivityComment(agent: string, sent: FinalizePart[], unknown: FinalizePart[]): string {
  let text = `Documents uploaded via ResSpark by ${agent}: ${sent.map(label).join(', ')}`
  if (unknown.length > 0) text += `\nUnconfirmed (check case documents): ${unknown.map(label).join(', ')}`
  return text.length > MAX_COMMENT ? text.slice(0, MAX_COMMENT - 1) + '…' : text
}

// One note per batch (PUSH-03): only the caller that wins the finalize flip posts it. An activity
// failure never touches the document rows; it lands on the batch's own activity_state.
export async function finalizeBatchIfDone(
  env: DbEnv,
  batchId: string,
  client: Pick<LogicsWriteClient, 'createActivity'>
): Promise<void> {
  const done = await finalizeBatch(env, batchId)
  if (!done || done.all_failed) return // not the winner, parts still open, or skipped (nothing reached Logics)
  const { batch } = done
  const result = await client.createActivity({
    caseId: Number(batch.logics_case_id),
    activityType: batch.activity_type,
    subject: 'Documents uploaded via ResSpark',
    comment: buildActivityComment(batch.agent_display_name, done.sent, done.unknown),
  })
  await recordBatchActivity(
    env,
    result.kind === 'sent'
      ? { batchId, state: 'sent', activityId: result.activityId }
      : { batchId, state: result.kind, error: result.code }
  )
}
