import type { ProviderId as ConnectionProvider } from '../db/connections'

// Connection providers plus vendors that never own a connections row (Smarty) or arrive in Phase 6 (DocuSeal).
export type ProviderId = ConnectionProvider | 'smarty' | 'docuseal'

// A vendor call failed. `transient` decides retry (queue backoff) versus dead-letter.
export class ProviderError extends Error {
  readonly provider: ProviderId
  readonly status: number | null
  readonly code: string
  readonly transient: boolean

  constructor(provider: ProviderId, status: number | null, code: string, transient: boolean, message?: string) {
    super(message ?? code)
    this.name = 'ProviderError'
    this.provider = provider
    this.status = status
    this.code = code
    this.transient = transient
  }
}

// null = the request never got a response (network).
export const isTransientStatus = (status: number | null) => status === null || status === 429 || status >= 500

// A job that can never succeed by retrying (missing row, unsupported kind): ack and record.
export class NonRetryableError extends Error {
  readonly code: string

  constructor(code: string, message?: string) {
    super(message ?? code)
    this.name = 'NonRetryableError'
    this.code = code
  }
}
