import type { LogicsCaseInfoRow, LogicsFindRow } from './client'

export type MatchedField = 'cell' | 'home' | 'work' | 'email' | 'case_id' | 'last_name_phone'

export interface LogicsCaseSummary {
  logics_case_id: number
  first_name: string | null
  last_name: string | null
  status_id: number | null
  created_date: string | null
  cell_phone: string | null
  home_phone: string | null
  work_phone: string | null
  email: string | null
  city: string | null
  state: string | null
  zip: string | null
  language: string | null
  matched_field: MatchedField | null
}

// '' and missing both mean "unknown" (null), never a default value.
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

const int = (v: unknown): number | null =>
  v === null || v === undefined || v === '' || !Number.isInteger(Number(v)) ? null : Number(v)

// Built field by field from an explicit list so DOB, MaritalStatus, and money fields never leak (C8, M6).
export function toSummary(row: LogicsFindRow | LogicsCaseInfoRow, matched: MatchedField | null): LogicsCaseSummary {
  return {
    logics_case_id: int(row.CaseID) as number,
    first_name: str(row.FirstName),
    last_name: str(row.LastName),
    status_id: int(row.StatusID ?? row.Status),
    created_date: str(row.CreatedDate),
    cell_phone: str(row.CellPhone),
    home_phone: str(row.HomePhone),
    work_phone: str(row.WorkPhone),
    email: str(row.Email),
    city: str(row.City),
    state: str(row.State),
    zip: str(row.Zip),
    language: str(row.Language),
    matched_field: matched,
  }
}
