// Read-only Logics API client (D-02). Every lookup parameter travels as an HTTP header, never a
// query string. Errors carry a kind and status only: no URL, header, credential, or body text.

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

export interface LogicsClient {
  findByPhone(phone: string): Promise<LogicsFindRow[]>
  findByEmail(email: string): Promise<LogicsFindRow[]>
  findByLastNameAndPhone(lastName: string, phone: string): Promise<LogicsFindRow[]>
  caseInfo(caseId: number): Promise<LogicsCaseInfoRow | null>
}

interface Envelope {
  Success?: boolean
  data?: unknown
}

export function createLogicsClient(creds: LogicsCreds, fetchImpl: typeof fetch = fetch): LogicsClient {
  const authHeader = 'Basic ' + Buffer.from(creds.apiKey + ':' + creds.secretToken).toString('base64')

  const send = (path: string, headers: Record<string, string>) =>
    fetchImpl(new URL(path, creds.baseUrl).toString(), {
      method: 'GET',
      headers: { authorization: authHeader, accept: 'application/json', ...headers },
      signal: AbortSignal.timeout(3000),
    })

  const call = async (path: string, headers: Record<string, string>): Promise<Envelope> => {
    let res: Response
    try {
      res = await send(path, headers)
    } catch {
      // Network failure or timeout: Logics reads are the only retried calls, and only once.
      try {
        res = await send(path, headers)
      } catch {
        throw new LogicsError('network')
      }
    }
    if (res.status === 401) throw new LogicsError('unauthorized', 401)
    if (res.status === 403) throw new LogicsError('forbidden', 403)
    if (!res.ok) throw new LogicsError('upstream', res.status)
    try {
      return ((await res.json()) ?? {}) as Envelope
    } catch {
      throw new LogicsError('invalid_response', res.status)
    }
  }

  const find = async (path: string, headers: Record<string, string>) => {
    const body = await call(path, headers)
    return Array.isArray(body.data) && body.Success !== false ? (body.data as LogicsFindRow[]) : []
  }

  return {
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
