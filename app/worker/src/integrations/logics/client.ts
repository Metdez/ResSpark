import {
  isActivityCreated,
  isCaseDocumentCreated,
  LOGICS_MAX_PART_BYTES,
  type LogicsWriteClient,
} from './write-types'

// Logics API client (D-02). Read errors carry a kind and status only: no URL, header, credential,
// or body text. The live tenant differs from the vendor docs (probed 2026-10-11): GET parameters go
// on the query string, the envelope is capitalized (`Data`, `Success`), and a Find with no match
// answers 404 "Resource not found!".
// The two writes (Phase 5, D-07) never throw: they return sent | failed | unknown.

export interface LogicsFindRow {
  CaseID: number
  CreatedDate?: string | null
  FirstName?: string | null
  LastName?: string | null
  StatusID?: number | null
  CellPhone?: string | null
  HomePhone?: string | null
  WorkPhone?: string | null
  Email?: string | null
  City?: string | null
  State?: string | null
  Zip?: string | null
  Language?: string | null
  [k: string]: unknown
}

export interface LogicsCaseInfoRow {
  CaseID: number
  FirstName?: string | null
  LastName?: string | null
  Status?: number | null
  CellPhone?: string | null
  HomePhone?: string | null
  WorkPhone?: string | null
  Email?: string | null
  City?: string | null
  State?: string | null
  Zip?: string | null
  Address?: string | null
  [k: string]: unknown
}

export type LogicsErrorKind =
  | 'unauthorized'
  | 'forbidden'
  | 'network'
  | 'upstream'
  | 'invalid_response'
  | 'not_configured'

export class LogicsError extends Error {
  constructor(
    public kind: LogicsErrorKind,
    public status?: number
  ) {
    super(kind)
    this.name = 'LogicsError'
  }
}

export interface LogicsCreds {
  baseUrl: string
  apiKey: string
  secretToken: string
}

export interface LogicsClient extends LogicsWriteClient {
  findByPhone(phone: string): Promise<LogicsFindRow[]>
  findByEmail(email: string): Promise<LogicsFindRow[]>
  findByLastNameAndPhone(lastName: string, phone: string): Promise<LogicsFindRow[]>
  caseInfo(caseId: number): Promise<LogicsCaseInfoRow | null>
}

interface Envelope {
  Success?: boolean
  data?: unknown
}

// Accepts the documented lowercase envelope and the live tenant's capitalized one.
export function normalizeEnvelope(v: unknown): unknown {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return v
  const o = v as Record<string, unknown>
  return { ...o, Success: o.Success ?? o.success, data: o.data !== undefined ? o.data : o.Data }
}

export function createLogicsClient(creds: LogicsCreds, fetchImpl: typeof fetch = fetch): LogicsClient {
  const authHeader = 'Basic ' + Buffer.from(creds.apiKey + ':' + creds.secretToken).toString('base64')

  // Logics reads GET parameters from the query string only. The documented header form is ignored
  // (400 "Email is required.") or unrouted (404 on CaseInfo); probed against the tenant 2026-10-11.
  const send = (path: string, params: Record<string, string>) => {
    const url = new URL(path, creds.baseUrl)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    return fetchImpl(url.toString(), {
      method: 'GET',
      headers: { authorization: authHeader, accept: 'application/json' },
      signal: AbortSignal.timeout(3000),
    })
  }

  const call = async (path: string, params: Record<string, string>): Promise<Envelope> => {
    let res: Response
    try {
      res = await send(path, params)
    } catch {
      // Network failure or timeout: Logics reads are the only retried calls, and only once.
      try {
        res = await send(path, params)
      } catch {
        throw new LogicsError('network')
      }
    }
    if (res.status === 401) throw new LogicsError('unauthorized', 401)
    if (res.status === 403) throw new LogicsError('forbidden', 403)
    if (!res.ok) throw new LogicsError('upstream', res.status)
    try {
      return (normalizeEnvelope(await res.json()) ?? {}) as Envelope
    } catch {
      throw new LogicsError('invalid_response', res.status)
    }
  }

  const find = async (path: string, params: Record<string, string>) => {
    // A Find with no match is a 404 on the live tenant, not an empty list.
    const body = await call(path, params).catch((e: unknown) => {
      if (e instanceof LogicsError && e.status === 404) return {} as Envelope
      throw e
    })
    return Array.isArray(body.data) && body.Success !== false ? (body.data as LogicsFindRow[]) : []
  }

  // 05-RESEARCH Q1 status table, shared by both writes. null = 2xx, parse the body.
  const writeStatus = (status: number) => {
    if (status === 401) return { kind: 'failed' as const, status, code: 'logics_auth' }
    if (status === 403) return { kind: 'failed' as const, status, code: 'logics_scope' }
    if (status >= 500) return { kind: 'unknown' as const, code: 'logics_5xx' }
    if (status >= 400) return { kind: 'failed' as const, status, code: `logics_rejected_${status}` }
    return null
  }

  // Writes are never retried here: any throw after dispatch is `unknown` (PUSH-04). The body is
  // parsed only through the zod guards and then dropped.
  const write = async (path: string, init: { headers: Record<string, string>; body: BodyInit }) => {
    let res: Response
    try {
      res = await fetchImpl(new URL(path, creds.baseUrl).toString(), {
        method: 'POST',
        headers: { authorization: authHeader, accept: 'application/json', ...init.headers },
        body: init.body,
        signal: AbortSignal.timeout(60_000),
      })
    } catch {
      return { early: { kind: 'unknown' as const, code: 'logics_no_response' } }
    }
    const early = writeStatus(res.status)
    if (early) return { early }
    return { body: normalizeEnvelope(await res.json().catch(() => null)) }
  }

  return {
    async createCaseDocument(p) {
      if (p.bytes.byteLength > LOGICS_MAX_PART_BYTES) return { kind: 'failed', status: 0, code: 'size_gate' }
      // No content-type header: the runtime writes the multipart boundary.
      const body = new FormData()
      body.append('CaseID', String(p.caseId))
      body.append('Comment', p.comment)
      if (p.fileCategoryId !== undefined) body.append('FileCategoryID', String(p.fileCategoryId))
      body.append('File', new File([p.bytes as Uint8Array<ArrayBuffer>], p.fileName, { type: 'application/pdf' }), p.fileName)
      const r = await write('Documents/CaseDocument', { headers: {}, body })
      if (r.early) return r.early
      return isCaseDocumentCreated(r.body)
        ? { kind: 'sent', logicsDocumentId: r.body.data.CaseDocumentID }
        : { kind: 'unknown', code: 'logics_unparsed_200' }
    },
    async createActivity(p) {
      const body = JSON.stringify({
        CaseID: p.caseId,
        ActivityType: p.activityType,
        Subject: p.subject,
        Comment: p.comment,
        Popup: false,
        Pin: false,
      })
      const r = await write('CaseActivity/Activity', { headers: { 'content-type': 'application/json' }, body })
      if (r.early) return r.early
      return isActivityCreated(r.body)
        ? { kind: 'sent', activityId: r.body.data.ActivityID }
        : { kind: 'unknown', code: 'logics_unparsed_200' }
    },
    // D-08: the distinct ActivityType values seen on a case, so staff can pick one that exists.
    // `data` is a single object in the vendor example although the text says it is a list.
    async listActivities(caseId) {
      let res: Response
      try {
        res = await send('CaseActivity/Activity', { CaseID: String(caseId) })
      } catch {
        return { kind: 'failed', status: 0 }
      }
      if (!res.ok) return { kind: 'failed', status: res.status }
      const body = normalizeEnvelope(await res.json().catch(() => null)) as Envelope | null
      const rows = Array.isArray(body?.data) ? body.data : body?.data ? [body.data] : []
      const types = rows
        .map((r) => (r && typeof r === 'object' ? (r as Record<string, unknown>).ActivityType : null))
        .filter((t): t is string => typeof t === 'string' && t.trim() !== '')
      return { activityTypes: [...new Set(types)].sort() }
    },
    findByPhone: (phone) => find('Find/FindCaseByPhone', { phone }),
    findByEmail: (email) => find('Find/FindCaseByEmail', { email }),
    findByLastNameAndPhone: (lastName, phone) => find('Find/FindCase', { lastName, phone }),
    async caseInfo(caseId) {
      // shortcut: Logics does not document the CaseInfo response for an unknown CaseID; treat
      // Success:false, null data, or a 404 as "no case" — tighten when Andrew confirms
      const body = await call('Case/CaseInfo', { CaseID: String(caseId) }).catch((e: unknown) => {
        if (e instanceof LogicsError && e.status === 404) return {} as Envelope
        throw e
      })
      const data = body.data as LogicsCaseInfoRow | null | undefined
      return body.Success !== false && data && typeof data === 'object' && 'CaseID' in data ? data : null
    },
  }
}
