import { recordConnectionEvent, setConnectionStatus, updateConnection, type ConnectionRow, type ConnectionStatus } from '../db/connections'
import { getOrder, mapOrderStatus, summarizeEmployers, type EmployerSummary } from '../integrations/truv/orders'
import { ProviderError } from '../integrations/provider-error'
import { collectEmployerFiles, getIncomeReport, getLinkDocuments, md5Hex, stripFileUrls, truvDownload, type TruvFileKind } from '../integrations/truv/reports'
import { employerSlug, storeProviderFile } from '../storage/connection-files'
import type { ReconcileOpts } from './reconcile'

// D-06 / PAY-02: every file of one completed employer, downloaded inside this job (vendor URLs expire).
async function fetchEmployerFiles(env: Env, conn: ConnectionRow, emp: EmployerSummary, linkId: string) {
  const [report, docs] = await Promise.all([getIncomeReport(env, linkId), getLinkDocuments(env, linkId)])
  const files = collectEmployerFiles(report, docs)
  const group = employerSlug(emp.company_name, emp.employer_id)
  const counts: Record<TruvFileKind, number> = { income_report: 0, pay_stub: 0, w2: 0, form_1099: 0, other: 0 }
  for (const f of files) {
    const load = async () => {
      const { bytes } = await truvDownload(f.url)
      if (f.md5 && md5Hex(bytes) !== f.md5.toLowerCase()) throw new ProviderError('truv', null, 'file_hash_mismatch', true)
      return bytes
    }
    await storeProviderFile(env, {
      conn,
      kind: 'payroll',
      group,
      name: f.name,
      displayName: f.displayName,
      mime: f.mime,
      document_type: f.kind,
      bytes: load,
      actor: 'provider:truv',
    })
    counts[f.kind] += 1
  }
  const result = { pay_stubs: counts.pay_stub, w2s: counts.w2, income_reports: counts.income_report }
  await recordConnectionEvent(env, conn.id, 'connection.documents_fetched', { employer_id: emp.employer_id, ...result })
  return { ...result, fetched_at: new Date().toISOString(), report: stripFileUrls(report) }
}

// Re-read the Truv order, fetch files for newly completed employers, then apply the order status.
export async function reconcilePayroll(
  env: Env,
  conn: ConnectionRow,
  opts: ReconcileOpts
): Promise<{ status: ConnectionStatus; applied: boolean }> {
  if (!conn.external_id) return { status: conn.status, applied: false } // order not created yet
  const order = await getOrder(env, conn.external_id)
  const previous = Array.isArray(conn.data.employers) ? (conn.data.employers as EmployerSummary[]) : []
  const employers = summarizeEmployers(order, previous)
  const data = { ...conn.data, employers, order_expired_at: order.expired_at ?? null }
  await updateConnection(env, conn.id, { data })
  const { status, code } = mapOrderStatus(order)

  // An expired order with work outstanding fetches nothing; an employer in error is skipped while
  // the completed ones are fetched (PAY-04). fetched_at makes a rerun download nothing.
  const expired = order.is_expired && code === 'order_expired'
  for (const e of expired ? [] : order.employers) {
    const emp = employers.find((s) => s.employer_id === e.id)
    if (e.status !== 'completed' || !e.link_id || !emp || emp.fetched_at) continue
    Object.assign(emp, await fetchEmployerFiles(env, conn, emp, e.link_id))
    await updateConnection(env, conn.id, { data }) // a crash mid-order keeps the finished employers
  }

  const res = await setConnectionStatus(env, conn.id, status, code ? { code } : {}, opts.actorId)
  return { status: res.status, applied: res.applied }
}
