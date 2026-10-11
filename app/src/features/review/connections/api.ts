import { api, isObject } from '@/lib/api'

// Contracts of app/worker/src/routes/admin-connections.ts (snake_case JSON, mirrored, not imported).
export interface MonthCell {
  year: number
  month: number
  status: string
  document_id: string | null
}

export interface AccountSummary {
  id: string
  mask: string | null
  name: string | null
  type: string | null
  subtype: string | null
  months: MonthCell[]
}

export interface EmployerView {
  employer_id: string
  company_name: string | null
  status: string
  pay_stubs: number
  w2s: number
  income_reports: number
  documents: Array<{ id: string; document_type: string; name: string }>
}

export interface ConnectionSummary {
  id: string
  request_item_id: string
  kind: 'bank' | 'payroll'
  provider: string
  status: string
  error: { code: string; message?: string } | null
  created_at: string
  last_webhook_at: string | null
  last_polled_at: string | null
  accounts: AccountSummary[]
  transactions: { count: number; update_status: string | null }
  employers: EmployerView[]
}

export interface TransactionRow {
  id: string
  date: string
  name: string | null
  merchant_name: string | null
  amount: number
  iso_currency_code: string | null
  category_primary: string | null
  pending: boolean
}

export interface TransactionsResponse {
  months: 3 | 6
  total: number
  transactions: TransactionRow[]
}

const str = (v: unknown) => typeof v === 'string'
const strOrNull = (v: unknown) => v === null || typeof v === 'string'
const num = (v: unknown) => typeof v === 'number'

const isMonth = (v: unknown): v is MonthCell =>
  isObject(v) && num(v.year) && num(v.month) && str(v.status) && strOrNull(v.document_id)

const isAccount = (v: unknown): v is AccountSummary =>
  isObject(v) &&
  str(v.id) &&
  [v.mask, v.name, v.type, v.subtype].every(strOrNull) &&
  Array.isArray(v.months) &&
  v.months.every(isMonth)

const isEmployerDoc = (v: unknown) => isObject(v) && str(v.id) && str(v.document_type) && str(v.name)

const isEmployer = (v: unknown): v is EmployerView =>
  isObject(v) &&
  str(v.employer_id) &&
  strOrNull(v.company_name) &&
  str(v.status) &&
  num(v.pay_stubs) &&
  num(v.w2s) &&
  num(v.income_reports) &&
  Array.isArray(v.documents) &&
  v.documents.every(isEmployerDoc)

export const isConnectionSummary = (v: unknown): v is ConnectionSummary =>
  isObject(v) &&
  str(v.id) &&
  str(v.request_item_id) &&
  (v.kind === 'bank' || v.kind === 'payroll') &&
  str(v.provider) &&
  str(v.status) &&
  (v.error === null || (isObject(v.error) && str(v.error.code))) &&
  str(v.created_at) &&
  strOrNull(v.last_webhook_at) &&
  strOrNull(v.last_polled_at) &&
  Array.isArray(v.accounts) &&
  v.accounts.every(isAccount) &&
  isObject(v.transactions) &&
  num(v.transactions.count) &&
  strOrNull(v.transactions.update_status) &&
  Array.isArray(v.employers) &&
  v.employers.every(isEmployer)

export const isConnectionsResponse = (v: unknown): v is { connections: ConnectionSummary[] } =>
  isObject(v) && Array.isArray(v.connections) && v.connections.every(isConnectionSummary)

const isRefreshResponse = (v: unknown): v is { connection: ConnectionSummary } =>
  isObject(v) && isConnectionSummary(v.connection)

const isTransaction = (v: unknown): v is TransactionRow =>
  isObject(v) &&
  str(v.id) &&
  str(v.date) &&
  strOrNull(v.name) &&
  strOrNull(v.merchant_name) &&
  num(v.amount) &&
  strOrNull(v.iso_currency_code) &&
  strOrNull(v.category_primary) &&
  typeof v.pending === 'boolean'

export const isTransactionsResponse = (v: unknown): v is TransactionsResponse =>
  isObject(v) &&
  (v.months === 3 || v.months === 6) &&
  num(v.total) &&
  Array.isArray(v.transactions) &&
  v.transactions.every(isTransaction)

const id = encodeURIComponent

export const fetchConnections = (requestId: string) =>
  api(`/api/admin/requests/${id(requestId)}/connections`, {}, isConnectionsResponse)

export const refreshConnection = (connectionId: string) =>
  api(`/api/admin/connections/${id(connectionId)}/refresh`, { method: 'POST' }, isRefreshResponse)

export const fetchTransactions = (connectionId: string, months: 3 | 6) =>
  api(`/api/admin/connections/${id(connectionId)}/transactions?months=${months}`, {}, isTransactionsResponse)
