import type { LogicsCaseInfoRow, LogicsClient, LogicsFindRow } from './client'
import { LOGICS_MAX_PART_BYTES, type FakeWriteOptions } from './write-types'

// Synthetic cases for LOGICS_MODE=fake (C1): example.com emails and 555-010-xxxx phones only.
// 900001 and 900002 share a phone in different formats, which exercises the multi-match path.
export const FAKE_CASES: LogicsFindRow[] = [
  {
    CaseID: 900001,
    CreatedDate: '2026-08-14T15:02:11',
    FirstName: 'Jordan',
    LastName: 'Rivera',
    StatusID: 191,
    CellPhone: '(555)010-0001',
    HomePhone: '',
    WorkPhone: '',
    Email: 'jordan.rivera@example.com',
    City: 'Austin',
    State: 'TX',
    Zip: '78701',
    Language: '',
  },
  {
    CaseID: 900002,
    CreatedDate: '2026-09-02T09:30:00',
    FirstName: 'Casey',
    LastName: 'Rivera',
    StatusID: 191,
    CellPhone: '',
    HomePhone: '5550100001',
    WorkPhone: '',
    Email: 'casey.rivera@example.com',
    City: 'Austin',
    State: 'TX',
    Zip: '78701',
    Language: '',
  },
  {
    CaseID: 900003,
    CreatedDate: '2026-07-01T12:00:00',
    FirstName: 'Morgan',
    LastName: 'Lee',
    StatusID: 120,
    CellPhone: '(555)010-0003',
    HomePhone: '',
    WorkPhone: '',
    Email: 'morgan.lee@example.com',
    City: 'Denver',
    State: 'CO',
    Zip: '80202',
    Language: '',
  },
  {
    CaseID: 900004,
    CreatedDate: '2026-09-20T08:15:00',
    FirstName: 'Taylor',
    LastName: 'Brooks',
    StatusID: 205,
    CellPhone: '',
    HomePhone: '',
    WorkPhone: '5550100004',
    Email: 'taylor.brooks@example.com',
    City: 'Phoenix',
    State: 'AZ',
    Zip: '85004',
    Language: '',
  },
]

// CaseInfo-only fields (Logics_API_Documentation CaseInfo): never in find* rows, so the Phase 2
// lookup summaries stay unchanged. Synthetic values for the Phase 7 Logics proposer.
export const FAKE_CASE_INFO_EXTRAS: Record<number, Record<string, string>> = {
  900001: { DOB: '07/24/1980', MaritalStatus: 'Married', TaxLiability: '$18,450.00', Address: '100 Congress Ave', AptNo: '' },
}

const digits = (v: unknown) => (typeof v === 'string' ? v.replace(/\D/g, '') : '')

const hasPhone = (row: LogicsFindRow, phone: string) => {
  const want = digits(phone)
  return want !== '' && [row.CellPhone, row.HomePhone, row.WorkPhone].some((p) => digits(p) === want)
}

const FAKE_FAILURES = {
  unknown: { kind: 'unknown', code: 'logics_no_response' },
  auth: { kind: 'failed', status: 401, code: 'logics_auth' },
  scope: { kind: 'failed', status: 403, code: 'logics_scope' },
  rejected: { kind: 'failed', status: 400, code: 'logics_rejected_400' },
} as const

const randomId = (base: number, span: number) => base + Math.floor(Math.random() * span)

// Same operations and response shapes as the live client; never calls fetch (D-10). Reads are
// instant; writes wait `delayMs` (default 300 ms) and return synthetic ids, or the injected
// `outcome` so tests drive every ledger branch without an env switch.
export function createFakeLogicsClient(opts: FakeWriteOptions = {}): LogicsClient {
  const outcome = opts.outcome ?? 'sent'
  const pause = () => new Promise((resolve) => setTimeout(resolve, opts.delayMs ?? 300))
  return {
    async createCaseDocument(p) {
      if (p.bytes.byteLength > LOGICS_MAX_PART_BYTES) return { kind: 'failed', status: 0, code: 'size_gate' }
      await pause()
      return outcome === 'sent' ? { kind: 'sent', logicsDocumentId: randomId(100_000, 900_000) } : FAKE_FAILURES[outcome]
    },
    async createActivity() {
      await pause()
      return outcome === 'sent' ? { kind: 'sent', activityId: randomId(9_000_000, 900_000) } : FAKE_FAILURES[outcome]
    },
    listActivities: async () => ({ activityTypes: ['General', 'Document sent'] }),
    findByPhone: async (phone) => FAKE_CASES.filter((r) => hasPhone(r, phone)),
    findByEmail: async (email) =>
      FAKE_CASES.filter((r) => r.Email?.toLowerCase() === email.trim().toLowerCase()),
    findByLastNameAndPhone: async (lastName, phone) =>
      FAKE_CASES.filter(
        (r) => r.LastName?.toLowerCase() === lastName.trim().toLowerCase() && hasPhone(r, phone)
      ),
    async caseInfo(caseId) {
      const row = FAKE_CASES.find((r) => r.CaseID === caseId)
      if (!row) return null
      // Reshape to the CaseInfo contract: `Status` instead of `StatusID`, no `CreatedDate`.
      const { StatusID, CreatedDate: _created, ...rest } = row
      return { ...rest, ...FAKE_CASE_INFO_EXTRAS[caseId], Status: StatusID } as LogicsCaseInfoRow
    },
  }
}
