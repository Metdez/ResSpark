// D-09: Plaid access tokens sealed with AES-GCM-256. AAD = the connection id, so a ciphertext copied
// onto another row will not open. Keys are TOKEN_ENC_KEY_<n> (64 hex chars); rotation adds _2.
export interface SealedToken {
  ciphertext: string
  iv: string
  key_version: number
}

const CURRENT_KEY_VERSION = 1

async function vaultKey(env: Env, version: number): Promise<CryptoKey> {
  const hex = (env as unknown as Record<string, string | undefined>)[`TOKEN_ENC_KEY_${version}`] ?? ''
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('bad_key')
  return crypto.subtle.importKey('raw', new Uint8Array(Buffer.from(hex, 'hex')), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

const aad = (connectionId: string) => new TextEncoder().encode(connectionId)

export async function sealToken(env: Env, connectionId: string, plaintext: string): Promise<SealedToken> {
  const key = await vaultKey(env, CURRENT_KEY_VERSION)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(connectionId) }, key, new TextEncoder().encode(plaintext))
  return {
    ciphertext: Buffer.from(ct).toString('base64url'),
    iv: Buffer.from(iv).toString('base64url'),
    key_version: CURRENT_KEY_VERSION,
  }
}

export async function openToken(env: Env, connectionId: string, sealed: SealedToken): Promise<string> {
  const key = await vaultKey(env, sealed.key_version)
  try {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(Buffer.from(sealed.iv, 'base64url')), additionalData: aad(connectionId) },
      key,
      new Uint8Array(Buffer.from(sealed.ciphertext, 'base64url'))
    )
    return new TextDecoder().decode(pt)
  } catch {
    throw new Error('decrypt_failed')
  }
}
