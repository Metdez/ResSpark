import { exportJWK, generateKeyPair, SignJWT } from 'jose'

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

// A stand-in for Plaid's webhook signer: an ES256 key pair, the public JWK (with kid) that
// /webhook_verification_key/get would return, and a Plaid-Verification JWT for a raw body.
export async function makePlaidSigner(): Promise<{
  kid: string
  jwk: JsonWebKey
  sign(raw: string, opts?: { iat?: number; alg?: string }): Promise<string>
}> {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true })
  const kid = `kid-${crypto.randomUUID()}`
  const jwk = { ...(await exportJWK(publicKey)), kid, alg: 'ES256', use: 'sig' } as JsonWebKey
  return {
    kid,
    jwk,
    async sign(raw, opts = {}) {
      const sha = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)))
      const alg = opts.alg ?? 'ES256'
      const jwt = new SignJWT({ request_body_sha256: sha })
        .setProtectedHeader({ alg, kid, typ: 'JWT' })
        .setIssuedAt(opts.iat ?? Math.floor(Date.now() / 1000))
      // the alg override exists only to build the negative case; HS256 needs a symmetric key
      return alg === 'ES256' ? jwt.sign(privateKey) : jwt.sign(new TextEncoder().encode('x'.repeat(32)))
    },
  }
}
