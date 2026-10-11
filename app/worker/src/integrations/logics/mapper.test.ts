import { describe, expect, it } from 'vitest'
import { toSummary } from './mapper'

// Sample rows copied from Logics_API_Documentation.docx.md (Find + Case/CaseInfo examples).
const findRow = {
  CaseID: 344624,
  CreatedDate: '2023-04-21T06:52:18',
  FirstName: 'Steve',
  LastName: 'Joe',
  StatusID: 191,
  SaleDate: '2025-01-09T00:00:00',
  CellPhone: '234234232',
  HomePhone: '(121)121-2121',
  WorkPhone: '934543554',
  Email: 'steve1234@hotmail.com',
  City: 'city details',
  State: 'NY',
  Zip: '66666-6666',
  Address: '',
  AptNo: '',
  Language: '',
  TaxAmount: 0.0,
  TeamID: 0,
}

const caseInfoRow = {
  CaseID: 128346,
  FirstName: 'first name',
  LastName: 'last name',
  DOB: '07/24/1995',
  Status: 1,
  SaleDate: null,
  CellPhone: '',
  HomePhone: '',
  WorkPhone: '',
  Email: 'test@test.com',
  City: '',
  State: '',
  Zip: '',
  Address: '',
  AptNo: '',
  MaritalStatus: '',
  BusinessName: '',
  TaxLiability: '',
  ServiceID: 89,
}

describe('toSummary', () => {
  it('maps the documented Find row, empty strings becoming null', () => {
    expect(toSummary(findRow, 'home')).toEqual({
      logics_case_id: 344624,
      first_name: 'Steve',
      last_name: 'Joe',
      status_id: 191,
      created_date: '2023-04-21T06:52:18',
      cell_phone: '234234232',
      home_phone: '(121)121-2121',
      work_phone: '934543554',
      email: 'steve1234@hotmail.com',
      city: 'city details',
      state: 'NY',
      zip: '66666-6666',
      language: null,
      matched_field: 'home',
    })
  })

  it('maps the documented CaseInfo row: Status → status_id, no created date, no DOB or money', () => {
    const s = toSummary(caseInfoRow, 'case_id')
    expect(s).toMatchObject({ logics_case_id: 128346, status_id: 1, created_date: null, matched_field: 'case_id' })
    for (const k of ['DOB', 'TaxLiability', 'TaxAmount', 'MaritalStatus', 'dob']) {
      expect(Object.keys(s)).not.toContain(k)
    }
    expect(JSON.stringify(s)).not.toContain('07/24/1995')
  })

  it('parses a string CaseID to an integer', () => {
    expect(toSummary({ ...findRow, CaseID: '344624' as unknown as number }, null).logics_case_id).toBe(344624)
  })

  it('treats a missing field as null', () => {
    const rest: Partial<typeof findRow> = { ...findRow }
    delete rest.FirstName
    expect(toSummary({ ...rest, CaseID: 344624 }, null).first_name).toBeNull()
  })

  it('treats a non-integer status as null', () => {
    expect(toSummary({ ...findRow, StatusID: 'x' as unknown as number }, null).status_id).toBeNull()
  })
})
