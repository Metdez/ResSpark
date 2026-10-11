// AES-GCM-256 sealing of firm integration credentials (D-01). INTEGRATION_ENC_KEY is a 32-byte secret
// as 64 hex chars, provisioned by app/scripts/provision-secrets.mjs (Plan 03). Rotating it means
// re-encrypting every firm_integrations row.

async function importAesKey(keyHex: string): Promise<CryptoKey> {
  if (!/^[0-9a-f]{64}$/i.test(keyHex)) throw new Error('bad_key')
  return crypto.subtle.importKey('raw', new Uint8Array(Buffer.from(keyHex, 'hex')), { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])
}

// Returns base64url(iv(12) ‖ ciphertext ‖ tag(16)).
export async function encryptSecret(keyHex: string, plaintext: string): Promise<string> {
  const key = await importAesKey(keyHex)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext))
  return Buffer.concat([iv, new Uint8Array(ct)]).toString('base64url')
}

export async function decryptSecret(keyHex: string, token: string): Promise<string> {
  const key = await importAesKey(keyHex)
  try {
    const bytes = new Uint8Array(Buffer.from(token, 'base64url'))
    if (bytes.length < 12 + 16) throw new Error('short')
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12))
    return new TextDecoder().decode(pt)
  } catch {
    // Wrong key, tampered bytes, and garbage input all look the same to the caller.
    throw new Error('decrypt_failed')
  }
}

// The only credential-derived value that may leave the Worker.
export function keyHint(apiKey: string): string {
  return apiKey.length < 4 ? '••••' : apiKey.slice(-4)
}
