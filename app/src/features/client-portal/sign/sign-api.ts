import { PortalError, portalFetch } from '../portal-api'

export type StartResult =
  | { kind: 'embed'; connectionId: string; embedSrc: string }
  | { kind: 'signed'; connectionId: string | null }

// T-06-25: only DocuSeal's own signing pages are ever rendered.
export const EMBED_PREFIX = 'https://docuseal.com/s/'

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

export const isStartResponse = (v: unknown): v is { connection_id: string; embed_src?: string; signed?: true } =>
  isObject(v) && typeof v.connection_id === 'string' && (v.signed === true || typeof v.embed_src === 'string')

export async function startSigning(itemId: string): Promise<StartResult> {
  const r = await portalFetch(
    `/api/c/items/${encodeURIComponent(itemId)}/signature/start`,
    { method: 'POST' },
    isStartResponse
  )
  if (r.signed) return { kind: 'signed', connectionId: r.connection_id }
  if (!r.embed_src?.startsWith(EMBED_PREFIX)) throw new PortalError(500, 'invalid_response')
  return { kind: 'embed', connectionId: r.connection_id, embedSrc: r.embed_src }
}
