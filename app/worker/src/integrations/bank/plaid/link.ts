import { ProviderError } from '../../provider-error'
import type { BankProvider } from '../provider'
import { plaidFetch } from './client'

const DAY_MS = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)

// D-10: the 6-month statement window (180 days back from today).
export const statementsWindow = (now: Date) => ({ start_date: iso(new Date(now.getTime() - 180 * DAY_MS)), end_date: iso(now) })

export interface LinkTokenParams {
  requestId: string
  firmName: string
  webhookUrl: string
  returnUrl: string
  statementsStart: string
  statementsEnd: string
}

// D-08: transactions only, statements only where supported (never in products: it would block
// linking at banks without statements), and 365 days so history is never the 90-day default.
export function linkTokenBody(p: LinkTokenParams): Record<string, unknown> {
  return {
    user: { client_user_id: p.requestId },
    client_name: p.firmName,
    country_codes: ['US'],
    language: 'en',
    webhook: p.webhookUrl,
    products: ['transactions'],
    transactions: { days_requested: 365 },
    required_if_supported_products: ['statements'],
    statements: { start_date: p.statementsStart, end_date: p.statementsEnd },
    hosted_link: { completion_redirect_uri: p.returnUrl, url_lifetime_seconds: 1800, is_mobile_app: false },
  }
}

export const createLinkSession: BankProvider['createLinkSession'] = async (env, p) => {
  const res = await plaidFetch<{ link_token: string; hosted_link_url?: string; expiration: string }>(
    env,
    '/link/token/create',
    linkTokenBody(p)
  )
  if (!res.hosted_link_url) throw new ProviderError('plaid', 200, 'no_hosted_link_url', false)
  return { linkRef: res.link_token, url: res.hosted_link_url, expiresAt: res.expiration }
}

interface AddResult {
  public_token?: string
  institution?: { name?: string } | null
}
interface LinkTokenGet {
  link_sessions?: Array<{ results?: { item_add_results?: AddResult[] } | null }>
}

// Public tokens from the SESSION_FINISHED webhook, or (missed webhook) from /link/token/get.
export const completeSession: BankProvider['completeSession'] = async (env, { linkRef, publicTokens }) => {
  let found: Array<{ token: string; institutionName: string | null }>
  if (publicTokens?.length) {
    found = publicTokens.map((token) => ({ token, institutionName: null }))
  } else {
    const got = await plaidFetch<LinkTokenGet>(env, '/link/token/get', { link_token: linkRef })
    found = (got.link_sessions ?? [])
      .flatMap((s) => s.results?.item_add_results ?? [])
      .filter((r): r is AddResult & { public_token: string } => typeof r.public_token === 'string')
      .map((r) => ({ token: r.public_token, institutionName: r.institution?.name ?? null }))
  }
  const out = []
  for (const f of found) {
    const ex = await plaidFetch<{ access_token: string; item_id: string }>(env, '/item/public_token/exchange', { public_token: f.token })
    out.push({ accessToken: ex.access_token, externalId: ex.item_id, institutionName: f.institutionName })
  }
  return out
}
