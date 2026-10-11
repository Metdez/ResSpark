// The verified body (parsed only after the signature check) and, for Plaid, the JWT iat.
export interface VerifiedWebhook {
  payload: Record<string, unknown>
  iat?: number
}

export interface WebhookAdapter {
  id: 'plaid' | 'truv'
  configured(env: Env): boolean
  // null = unverifiable; must be computed over the exact raw bytes received.
  verify(raw: string, headers: Headers, env: Env): Promise<VerifiedWebhook | null>
  eventKey(v: VerifiedWebhook): string
}
