import type { LogicsCaseInfoRow, LogicsClient, LogicsFindRow } from './client'

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

const digits = (v: unknown) => (typeof v === 'string' ? v.replace(/\D/g, '') : '')

const hasPhone = (row: LogicsFindRow, phone: string) => {
  const want = digits(phone)
  return want !== '' && [row.CellPhone, row.HomePhone, row.WorkPhone].some((p) => digits(p) === want)
}

// Same four operations and response shapes as the live client; no network, no delay.
export function createFakeLogicsClient(): LogicsClient {
  return {
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
      return { ...rest, Status: StatusID } as LogicsCaseInfoRow
    },
  }
}
