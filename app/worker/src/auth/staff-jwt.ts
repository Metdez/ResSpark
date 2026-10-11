import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'

export interface StaffClaims extends JWTPayload {
  sub: string
  email?: string
  role: string
  app_metadata?: { firm_id?: string; role?: string }
}

// Module-scope cache is safe: it holds public keys only, keyed by issuer.
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

// Throws on any failure (malformed, foreign key, expired, wrong iss/aud); staffAuth maps it to 401.
export async function verifyStaffJwt(token: string, supabaseUrl: string): Promise<StaffClaims> {
  const issuer = `${supabaseUrl}/auth/v1`
  let jwks = keySets.get(issuer)
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`))
    keySets.set(issuer, jwks)
  }
  const { payload } = await jwtVerify(token, jwks, {
    issuer,
    audience: 'authenticated',
    algorithms: ['ES256'],
  })
  if (typeof payload.sub !== 'string') throw new Error('missing sub')
  return payload as StaffClaims
}
