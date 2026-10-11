import { CONSENT_TEXT } from '@/lib/consent-text'
import { portalFetch } from '../portal-api'

export type MonthStatus = 'pending' | 'available' | 'not_supported' | 'manual' | 'missing'

export interface ClientConnectionView {
  id: string
  status: 'pending' | 'connected' | 'syncing' | 'done' | 'error' | 'removed'
  error_code: string | null
  accounts: Array<{
    id: string
    mask: string | null
    name: string | null
    months: Array<{ year: number; month: number; status: MonthStatus }>
  }>
  employers: Array<{
    company_name: string | null
    status: 'pending' | 'connected' | 'done' | 'error'
    pay_stubs: number
    w2s: number
  }>
}

export interface ItemConnection {
  provider: {
    id: 'plaid' | 'truv' | 'teller' | null
    configured: boolean
    capabilities: { transactions: boolean; statementPdfs: boolean; hostedLink: boolean } | null
  }
  consented: boolean
  connection: ClientConnectionView | null
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null

const isView = (v: unknown): v is ClientConnectionView =>
  isObject(v) &&
  typeof v.id === 'string' &&
  typeof v.status === 'string' &&
  Array.isArray(v.accounts) &&
  Array.isArray(v.employers)

export const isItemConnection = (v: unknown): v is ItemConnection =>
  isObject(v) &&
  isObject(v.provider) &&
  typeof v.provider.configured === 'boolean' &&
  typeof v.consented === 'boolean' &&
  (v.connection === null || isView(v.connection))

const isStart = (
  v: unknown
): v is { connection_id: string; bridge_token?: string; hosted_link_url?: string } =>
  isObject(v) && typeof v.connection_id === 'string'

const isAny = (_v: unknown): _v is unknown => true

const post = (body?: unknown) =>
  body === undefined ? { method: 'POST' } : { method: 'POST', body: JSON.stringify(body) }

export const getItemConnection = (itemId: string) =>
  portalFetch(`/api/c/items/${encodeURIComponent(itemId)}/connection`, {}, isItemConnection)

export async function recordConsent(kind: 'bank_data' | 'payroll_data'): Promise<void> {
  await portalFetch('/api/c/consents', post({ kind, text_version: CONSENT_TEXT[kind].version }), isAny)
}

export const startConnection = (kind: 'bank' | 'payroll', itemId: string) =>
  portalFetch(`/api/c/connections/${kind}/start`, post({ item_id: itemId }), isStart)

// Best effort: the server also reconciles on webhook, so a lost call only delays status.
export async function reconcileConnection(connectionId: string): Promise<void> {
  try {
    await portalFetch(`/api/c/connections/${encodeURIComponent(connectionId)}/reconcile`, post(), isAny)
  } catch {
    // swallowed on purpose
  }
}

export async function attributeStatement(
  connectionId: string,
  body: { document_id: string; bank_account_id: string; year: number; month: number }
): Promise<void> {
  await portalFetch(
    `/api/c/connections/${encodeURIComponent(connectionId)}/statements/manual`,
    post(body),
    isAny
  )
}
