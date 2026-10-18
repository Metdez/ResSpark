import { describe, expect, it } from 'vitest'
import type { ConnectionRow } from './connections'
import { projectSummary, type SummaryParts } from './connections-ops'

// The ConnectionSummary projection is pure; the queries that feed it are covered live.
const NOW = new Date('2026-10-11T12:00:00Z')
const base = (over: Partial<ConnectionRow> = {}): ConnectionRow => ({
  id: 'C1',
  firm_id: 'F1',
  request_id: 'R1',
  request_item_id: 'I1',
  case_id: 'K1',
  provider: 'plaid',
  kind: 'bank',
  external_id: 'item_1',
  link_ref: 'link_1',
  return_nonce: 'nonce-secret',
  status: 'connected',
  data: {},
  error: null,
  sync_cursor: 'cursor-secret',
  last_webhook_at: null,
  last_polled_at: '2026-10-11T11:00:00Z',
  connected_at: '2026-10-11T10:00:00Z',
  completed_at: null,
  remove_after: null,
  removed_at: null,
  created_at: '2026-10-11T09:00:00Z',
  ...over,
})
type StoredMonth = SummaryParts['accounts'][number]['bank_statement_months'][number]
const account = (id: string, mask: string | null, months: StoredMonth[] = []) => ({
  id,
  external_account_id: `ext_${id}`,
  mask,
  name: `Account ${id}`,
  type: 'depository',
  subtype: 'checking',
  bank_statement_months: months,
})
const empty: SummaryParts = { accounts: [], transactionCount: 0, documents: [] }

describe('projectSummary', () => {
  it('renders six months per account newest first and fills absent months as missing', () => {
    const months: StoredMonth[] = [
      { year: 2026, month: 9, status: 'available', document_id: 'D9' },
      { year: 2026, month: 5, status: 'manual', document_id: null },
    ]
    const s = projectSummary(base(), { ...empty, accounts: [account('A1', '1111', months)] }, NOW)
    expect(s.accounts[0].months).toEqual([
      { year: 2026, month: 9, status: 'available', document_id: 'D9' },
      { year: 2026, month: 8, status: 'missing', document_id: null },
      { year: 2026, month: 7, status: 'missing', document_id: null },
      { year: 2026, month: 6, status: 'missing', document_id: null },
      { year: 2026, month: 5, status: 'manual', document_id: null },
      { year: 2026, month: 4, status: 'missing', document_id: null },
    ])
  })

  it('ignores stored months outside the window', () => {
    const old: StoredMonth[] = [{ year: 2025, month: 1, status: 'available', document_id: 'D' }]
    const s = projectSummary(base(), { ...empty, accounts: [account('A1', '1', old)] }, NOW)
    expect(s.accounts[0].months.every((m) => m.status === 'missing')).toBe(true)
  })

  it('orders accounts by mask then id, null masks last', () => {
    const accounts = [account('B', '2222'), account('Z', null), account('C', '1111'), account('A', '2222')]
    const s = projectSummary(base(), { ...empty, accounts }, NOW)
    expect(s.accounts.map((a) => a.id)).toEqual(['C', 'A', 'B', 'Z'])
  })

  it.each([
    ['HISTORICAL_UPDATE_COMPLETE', 'historical'],
    ['INITIAL_UPDATE_COMPLETE', 'initial'],
    ['NOT_READY', 'not_ready'],
    ['historical', 'historical'],
    [undefined, null],
  ])('maps transactions_update_status %s to %s', (raw, expected) => {
    const data = raw === undefined ? {} : { transactions_update_status: raw }
    const s = projectSummary(base({ data }), { ...empty, transactionCount: 42 }, NOW)
    expect(s.transactions).toEqual({ count: 42, update_status: expected })
  })

  it('copies capabilities from the provider table and never leaks secrets or vendor ids', () => {
    const s = projectSummary(base(), empty, NOW)
    expect(s.capabilities).toEqual({ transactions: true, statementPdfs: true, hostedLink: true })
    const json = JSON.stringify(s)
    for (const leak of ['nonce-secret', 'cursor-secret', 'link_1', 'item_1']) expect(json).not.toContain(leak)
  })

  it('keeps only the error code and a string message', () => {
    const error = { code: 'link_expired', message: 'x', raw: { body: 'vendor' } }
    const s = projectSummary(base({ status: 'error', error }), empty, NOW)
    expect(s.error).toEqual({ code: 'link_expired', message: 'x' })
  })

  it('builds employers with per-employer document counts from the storage group', () => {
    const conn = base({
      provider: 'truv',
      kind: 'payroll',
      data: {
        employers: [
          { employer_id: 'e1', link_id: 'l1', company_name: 'Acme Inc', status: 'done' },
          { employer_id: 'e2', link_id: null, company_name: null, status: 'pending' },
        ],
      },
    })
    const prefix = 'firm/F1/case/K1/item/I1/payroll'
    const doc = (id: string, type: string, group: string) => ({
      id,
      document_type: type,
      original_filename: `${id}.pdf`,
      storage_key: `${prefix}/${group}/${id}.pdf`,
    })
    const documents = [
      doc('d1', 'pay_stub', 'acme-inc-e1'),
      doc('d2', 'pay_stub', 'acme-inc-e1'),
      doc('d3', 'w2', 'acme-inc-e1'),
      doc('d4', 'income_report', 'acme-inc-e1'),
      doc('d5', 'pay_stub', 'other-e10'),
    ]
    const s = projectSummary(conn, { ...empty, documents }, NOW)
    expect(s.capabilities).toBeNull()
    expect(s.employers[0]).toMatchObject({
      employer_id: 'e1',
      company_name: 'Acme Inc',
      status: 'done',
      pay_stubs: 2,
      w2s: 1,
      income_reports: 1,
    })
    expect(s.employers[0].documents.map((d) => d.id)).toEqual(['d1', 'd2', 'd3', 'd4'])
    expect(s.employers[0].documents[0]).toEqual({ id: 'd1', document_type: 'pay_stub', name: 'd1.pdf' })
    expect(s.employers[1]).toMatchObject({ employer_id: 'e2', pay_stubs: 0, w2s: 0, income_reports: 0, documents: [] })
    // no stored report: nothing to tabulate
    expect(s.employers.map((e) => e.recent_pay)).toEqual([[], []])
  })

  it('lists each employer pay stub from the last three months, newest first, linked to its stored file', () => {
    // NOW is 2026-10-11, so the window starts 2026-07-01: 06-30 is out, 07-01 is in.
    const report = {
      employments: [
        {
          statements: [
            { pay_date: '2026-08-31', check_number: null, gross_pay: '2000.00', net_pay: '1500.00' },
            { pay_date: '2026-09-15', check_number: '1001', gross_pay: '2000.00', net_pay: null },
            { pay_date: '2026-06-30', check_number: null, gross_pay: '2000.00', net_pay: '1500.00' },
          ],
        },
        { statements: [{ pay_date: '2026-07-01', check_number: null, gross_pay: 'n/a', net_pay: '10.5' }] },
      ],
    }
    const conn = base({
      provider: 'truv',
      kind: 'payroll',
      data: {
        employers: [
          { employer_id: 'e1', company_name: 'Acme Inc', status: 'done', report },
          { employer_id: 'e2', company_name: null, status: 'pending' },
        ],
      },
    })
    const prefix = 'firm/F1/case/K1/item/I1/payroll'
    const stub = (id: string, group: string, name: string) => ({
      id,
      document_type: 'pay_stub',
      original_filename: name,
      storage_key: `${prefix}/${group}/${name}`,
    })
    const documents = [
      stub('d9', 'other-e10', 'paystub-2026-08-31.pdf'), // same name, another employer's group
      stub('d1', 'acme-inc-e1', 'paystub-2026-09-15-1001.pdf'),
      stub('d2', 'acme-inc-e1', 'paystub-2026-08-31.pdf'),
      stub('d3', 'acme-inc-e1', 'paystub-2026-06-30.pdf'),
    ]
    const s = projectSummary(conn, { ...empty, documents }, NOW)
    expect(s.employers[0].recent_pay).toEqual([
      { pay_date: '2026-09-15', gross_pay: 2000, net_pay: null, document_id: 'd1' },
      { pay_date: '2026-08-31', gross_pay: 2000, net_pay: 1500, document_id: 'd2' },
      { pay_date: '2026-07-01', gross_pay: null, net_pay: 10.5, document_id: null },
    ])
    expect(s.employers[1].recent_pay).toEqual([])
  })
})
