// RED stub: signatures only; the GREEN commit implements them.
export interface ClientLinkRow {
  id: string
  firm_id: string
  request_id: string | null
  version: number
  expires_at: string
  revoked_at: string | null
  opened_at: string | null
}
type LinkEnv = Pick<Env, 'CLIENT_LINK_HMAC_KEY' | 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>
export const hmacKey = async (_secret: string) => undefined as unknown as CryptoKey
export const cookieSecret = async (_secret: string) => ''
export const uuidToBytes = (_id: string) => new Uint8Array(16)
export const bytesToUuid = (_b: Uint8Array) => ''
export const mintLinkToken = async (_k: CryptoKey, _id: Uint8Array, _v: number) => ''
export const verifyLinkToken = async (
  _env: LinkEnv,
  _token: string,
  _find?: (env: LinkEnv, id: Uint8Array) => Promise<ClientLinkRow | null>
): Promise<ClientLinkRow | null> => null
