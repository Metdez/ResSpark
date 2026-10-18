import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionRow } from '../db/connections'
import { employerSlug, providerObjectPath, storeProviderFile } from './connection-files'

const state = vi.hoisted(() => ({
  lookups: [] as Array<{ id: string } | null>,
  inserts: [] as Array<Record<string, unknown>>,
  uploads: [] as Array<{ path: string; opts: unknown }>,
  insertError: null as { code: string; message: string } | null,
}))

vi.mock('../db/client', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.lookups.shift() ?? null, error: null }) }) }),
      insert: async (row: Record<string, unknown>) => {
        state.inserts.push(row)
        return { error: state.insertError }
      },
    }),
    storage: {
      from: () => ({
        upload: async (path: string, _bytes: unknown, opts: unknown) => {
          state.uploads.push({ path, opts })
          return { error: null }
        },
      }),
    },
  }),
}))

const env = {} as Env
const conn = { id: 'CONN', firm_id: 'F', case_id: 'C', request_item_id: 'I' } as ConnectionRow
const pdf = new TextEncoder().encode('%PDF-1.4 tiny').buffer as ArrayBuffer
const input = (over: Partial<Parameters<typeof storeProviderFile>[1]> = {}) => ({
  conn,
  kind: 'payroll' as const,
  group: 'acme-inc-emp_1',
  name: 'paystub-2026-09-15-1001.pdf',
  mime: 'application/pdf',
  document_type: 'pay_stub',
  bytes: pdf,
  actor: 'provider:truv',
  ...over,
})

beforeEach(() => {
  state.lookups = []
  state.inserts = []
  state.uploads = []
  state.insertError = null
})

describe('employerSlug / providerObjectPath', () => {
  it('slugs the company and keeps the employer id', () => {
    expect(employerSlug('Acme Inc', 'emp_1')).toBe('acme-inc-emp_1')
    expect(employerSlug(null, 'emp_2')).toBe('employer-emp_2')
  })
  it('never cuts the employer id from a long name', () => {
    const slug = employerSlug('A'.repeat(200), 'emp_9')
    expect(slug.endsWith('-emp_9')).toBe(true)
    expect(slug.length).toBeLessThanOrEqual(60)
  })
  it('builds the payroll layout without traversal', () => {
    const path = providerObjectPath({ firm_id: 'F', case_id: 'C', request_item_id: 'I', kind: 'payroll', group: 'acme-inc-emp_1', name: 'paystub-2026-09-15-1001.pdf' })
    expect(path).toBe('firm/F/case/C/item/I/payroll/acme-inc-emp_1/paystub-2026-09-15-1001.pdf')
    expect(providerObjectPath({ firm_id: 'F', case_id: 'C', request_item_id: 'I', kind: 'payroll', group: '../x', name: '../../y.pdf' })).not.toContain('..')
  })
  it('builds the signature layout under the DocuSeal submission id', () => {
    const path = providerObjectPath({ firm_id: 'F', case_id: 'C', request_item_id: 'I', kind: 'signature', group: '4001', name: 'audit-log.pdf' })
    expect(path).toBe('firm/F/case/C/item/I/signature/4001/audit-log.pdf')
  })
})

describe('storeProviderFile', () => {
  it('an existing row for the path: created false, no upload, no download', async () => {
    state.lookups = [{ id: 'D0' }]
    const loader = vi.fn(async () => pdf)
    expect(await storeProviderFile(env, input({ bytes: loader }))).toMatchObject({ document_id: 'D0', created: false })
    expect(state.uploads).toHaveLength(0)
    expect(loader).not.toHaveBeenCalled()
  })
  it('non-PDF bytes declared as PDF: bad_file_type, nothing written', async () => {
    const html = new TextEncoder().encode('<html>').buffer as ArrayBuffer
    await expect(storeProviderFile(env, input({ bytes: html }))).rejects.toThrow('bad_file_type')
    expect(state.uploads).toHaveLength(0)
    expect(state.inserts).toHaveLength(0)
  })
  it('a fresh path: upload with upsert false and a ready documents row', async () => {
    const res = await storeProviderFile(env, input())
    expect(res.created).toBe(true)
    expect(state.uploads).toEqual([
      { path: 'firm/F/case/C/item/I/payroll/acme-inc-emp_1/paystub-2026-09-15-1001.pdf', opts: { contentType: 'application/pdf', upsert: false } },
    ])
    expect(state.inserts[0]).toMatchObject({
      status: 'ready',
      document_type: 'pay_stub',
      connection_id: 'CONN',
      request_item_id: 'I',
      uploaded_by_actor: 'provider:truv',
      size_bytes: pdf.byteLength,
    })
    expect(state.inserts[0].sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('displayName becomes original_filename while the path keeps name', async () => {
    await storeProviderFile(env, input({ displayName: 'Pay stub - September 15, 2026.pdf' }))
    expect(state.uploads[0].path.endsWith('/paystub-2026-09-15-1001.pdf')).toBe(true)
    expect(state.inserts[0].original_filename).toBe('Pay stub - September 15, 2026.pdf')
  })
  it('a concurrent writer won the unique storage_key: created false with its id', async () => {
    state.lookups = [null, { id: 'D9' }]
    state.insertError = { code: '23505', message: 'duplicate key' }
    expect(await storeProviderFile(env, input())).toMatchObject({ document_id: 'D9', created: false })
  })
})
